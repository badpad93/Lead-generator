import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sendFormConfirmationEmails } from "@/lib/confirmationEmail";
import {
  provisionAccountForGuestCheckout,
  generateGuestToken,
  guestTokenExpiry,
} from "@/lib/auth/provisionalAccount";

/**
 * Prequalification thresholds — an applicant clears every check to
 * receive the UMSB SBA financing application PDF automatically.
 * Deliberately conservative so we only auto-send to applicants worth
 * a lender's time. Admin (james@apexaivending.com) still sees the raw
 * submission regardless, so borderline cases don't get lost.
 */
const QUALIFYING_CREDIT_RANGES = new Set([
  "700–749",
  "750+",
]);
const QUALIFYING_CITIZENSHIP = new Set([
  "US Citizen",
  "Permanent Resident",
]);

function evaluateSbaQualification(body: Record<string, unknown>): {
  qualified: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!QUALIFYING_CREDIT_RANGES.has(String(body.credit_score_range ?? ""))) {
    reasons.push("credit score below 700");
  }
  if (!QUALIFYING_CITIZENSHIP.has(String(body.citizenship_status ?? ""))) {
    reasons.push("citizenship not eligible");
  }
  if (!body.has_verifiable_income) reasons.push("no verifiable income");
  if (body.has_bankruptcy) reasons.push("bankruptcy in last 7 years");
  if (body.has_tax_liens) reasons.push("outstanding tax liens");
  if (body.has_federal_debt) reasons.push("delinquent federal debt");
  return { qualified: reasons.length === 0, reasons };
}

const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";
const NOTIFY_EMAIL = process.env.FINANCING_NOTIFY_EMAIL || "james@apexaivending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (!body.full_name || !body.email || !body.phone) {
    return NextResponse.json({ error: "Full name, email, and phone are required" }, { status: 400 });
  }
  if (!body.agreed_provide_docs || !body.agreed_accurate_info) {
    return NextResponse.json({ error: "You must agree to both attestations" }, { status: 400 });
  }

  // Auto-provision an account for anonymous applicants so the financing
  // pre-qual is a "shop without signing up" flow. The form already
  // collects name/email/phone — that's enough to spin up a profile.
  // Existing accounts return a friendly 409 so we never silently
  // attach a financing application to a stranger's real login.
  let userId = await getUserIdFromRequest(req);
  let provisionedUserId: string | null = null;
  if (!userId) {
    try {
      const provisionResult = await provisionAccountForGuestCheckout({
        email: body.email,
        business_name: body.full_name,
        contact_name: body.full_name,
        phone: body.phone,
        address: "",
        marketing_consent: body.marketing_consent !== false,
      });
      if ("existing" in provisionResult && provisionResult.existing) {
        return NextResponse.json(
          {
            error: "An account already exists for this email. Please sign in and re-apply.",
            requires_sign_in: true,
          },
          { status: 409 },
        );
      }
      userId = provisionResult.userId;
      provisionedUserId = provisionResult.userId;
    } catch (provErr) {
      const msg = provErr instanceof Error ? provErr.message : "Failed to create account";
      console.error("[financing] guest provision failed:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
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

  // Auto-create CRM account + lead for the financing applicant (skip if lead already exists)
  let crmAccountId: string | null = null;
  let crmLeadId: string | null = null;
  try {
    const financingBizName = body.business_name || body.full_name;
    const { data: existingLead } = await supabaseAdmin
      .from("sales_leads")
      .select("id, account_id")
      .eq("business_name", financingBizName)
      .limit(1)
      .maybeSingle();

    if (existingLead) {
      crmLeadId = existingLead.id;
      crmAccountId = existingLead.account_id;
    } else {
      const { findOrCreateSalesAccount } = await import("@/lib/salesAccountResolver");
      let account: { id: string } | null = null;
      try {
        const resolved = await findOrCreateSalesAccount({
          business_name: financingBizName,
          contact_name: body.full_name,
          phone: body.phone,
          email: body.email,
          entity_type: "operator",
        });
        account = { id: resolved.id };
      } catch {
        account = null;
      }

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
            business_name: financingBizName,
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

  // Send confirmation copy to applicant (non-blocking)
  sendFormConfirmationEmails({
    formName: "SBA Financing Pre-Qualification",
    submitterEmail: body.email,
    submitterName: body.full_name,
    fields: [
      { label: "Full Name", value: body.full_name },
      { label: "Email", value: body.email },
      { label: "Phone", value: body.phone },
      { label: "Date of Birth", value: body.date_of_birth },
      { label: "Citizenship", value: body.citizenship_status },
      { label: "Credit Score Range", value: body.credit_score_range },
      { label: "Net Worth Range", value: body.net_worth_range },
      { label: "Annual Income", value: body.annual_income },
      { label: "Verifiable Income", value: !!body.has_verifiable_income },
      { label: "Outstanding Tax Liens", value: !!body.has_tax_liens },
      { label: "Bankruptcy (Last 7 Years)", value: !!body.has_bankruptcy },
      { label: "Outstanding Judgments", value: !!body.has_judgments },
      { label: "Felony Conviction", value: !!body.has_felony },
      { label: "Current Legal Actions", value: !!body.has_legal_actions },
      { label: "Delinquent Federal Debt", value: !!body.has_federal_debt },
    ],
    adminSubject: `Financing Application Copy: ${body.full_name}`,
  }).catch((e) => console.error("[financing] confirmation email error", e));

  // Prequalification check — if all criteria pass, auto-email the
  // United Midwest Savings Bank SBA application PDF to the applicant
  // and CC the admin inbox. Non-blocking. Admin still sees the raw
  // application email regardless of qualification.
  const evaluation = evaluateSbaQualification(body);
  if (evaluation.qualified) {
    try {
      const pdfPath = path.join(process.cwd(), "public", "financing", "umsb-sba-application.pdf");
      const pdfBuffer = fs.readFileSync(pdfPath);
      const origin =
        req.headers.get("origin") ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        "https://vendingconnector.com";
      const completionUrl = `${origin}/financing/complete-application?ref=${application.id}`;
      const directPdfUrl = `${origin}/financing/umsb-sba-application.pdf`;

      await getResend().emails.send({
        from: FROM_EMAIL,
        to: body.email,
        cc: [NOTIFY_EMAIL],
        subject: "You pre-qualified for SBA financing — next step: complete the application",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
            <h2 style="color:#16a34a;margin:0 0 12px;">Great news, ${body.full_name.split(" ")[0]}!</h2>
            <p>Based on your pre-qualification responses, you meet our lender's baseline criteria for SBA financing.</p>
            <p><strong>Next step:</strong> complete the United Midwest Savings Bank SBA Financing Application. Click the button below to open a page with the fillable PDF, step-by-step instructions, and a one-click upload to send it right back to us — no email required.</p>
            <p style="text-align:center;margin:28px 0">
              <a href="${completionUrl}"
                 style="display:inline-block;background:#16a34a;color:#ffffff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px">
                Complete Your Application →
              </a>
            </p>
            <p style="font-size:13px;color:#555">
              Prefer to skip the page and go straight to the PDF? <a href="${directPdfUrl}" style="color:#16a34a">Download it here</a>, or use the copy attached to this email. When you're done, upload it on the page above — or reply to this email / send the completed PDF to <a href="mailto:${NOTIFY_EMAIL}" style="color:#16a34a">${NOTIFY_EMAIL}</a> if uploading isn't convenient.</p>
            <p style="margin-top:20px;padding:12px;background:#f0fdf4;border-left:3px solid #16a34a;font-size:13px;">
              <strong>Reminder:</strong> pre-qualification is not final loan approval. Final approval is subject to lender review and full underwriting. Typical turnaround after we receive your completed application is 3–5 business days.
            </p>
            <p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
              Questions? Reply to this email or call (888) 851-1462.<br>
              Application ID: ${application.id}
            </p>
          </div>
        `,
        attachments: [
          {
            filename: "UMSB-SBA-Financing-Application.pdf",
            content: pdfBuffer,
          },
        ],
      });
    } catch (pdfEmailErr) {
      console.error("[financing] Failed to send UMSB application PDF:", pdfEmailErr);
    }
  } else {
    // Log to server console so admin can see why the auto-send didn't
    // fire for this applicant. Doesn't affect the CRM record.
    console.log(
      `[financing] Applicant ${body.email} did not qualify for auto-send:`,
      evaluation.reasons.join(", "),
    );
  }

  // Spawn financing workflow. Best-effort — never blocks the submission.
  try {
    const { spawnFromFinancingApplication } = await import("@/lib/workflows/hooks");
    await spawnFromFinancingApplication(application.id, {
      customerId: userId,
      companyId: crmAccountId ?? undefined,
    });
  } catch (workflowErr) {
    console.error("[financing] workflow spawn failed:", workflowErr);
  }

  // Guest-only: email the applicant a claim link so they can set a
  // password on the account we just auto-provisioned and check their
  // application status later.
  if (provisionedUserId) {
    try {
      const passwordToken = generateGuestToken();
      const trackingToken = generateGuestToken();
      const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
      await supabaseAdmin.from("guest_checkout_sessions").insert({
        provisioned_user_id: provisionedUserId,
        email: body.email,
        contact_name: body.full_name,
        phone: body.phone,
        password_token: passwordToken,
        password_token_expires_at: guestTokenExpiry(7).toISOString(),
        tracking_token: trackingToken,
        tracking_token_expires_at: guestTokenExpiry(30).toISOString(),
        marketing_consent: body.marketing_consent !== false,
      });

      const claimUrl = `${origin}/coffee/claim/${passwordToken}`;
      const resend = getResend();
      await resend.emails.send({
        from: FROM_EMAIL,
        to: body.email,
        subject: "Your Vending Connector account is ready — set a password",
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color:#16a34a;">Thanks, ${body.full_name}!</h2>
            <p>We received your SBA financing application. We also created a free Vending Connector account for you so you can sign in later to track your application, upload documents, and manage your business.</p>
            <p><a href="${claimUrl}" style="display:inline-block; background:#16a34a; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Set my password</a></p>
            <p style="font-size:12px; color:#6b7280;">Link expires in 7 days.</p>
          </div>
        `,
      });
    } catch (claimErr) {
      console.error("[financing] guest claim email failed:", claimErr);
    }
  }

  return NextResponse.json({
    success: true,
    applicationId: application.id,
    crmAccountId,
    crmLeadId,
    qualified: evaluation.qualified,
    disqualifyReasons: evaluation.qualified ? [] : evaluation.reasons,
  });
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
