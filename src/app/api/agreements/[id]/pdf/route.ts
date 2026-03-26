import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("signed_agreements")
    .select("id, user_id, agreement_text, full_name, user_email, ip_address, agreement_version, created_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (data.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generate downloadable HTML document from agreement text
  const htmlContent = buildPdfHtml(data);

  return new NextResponse(htmlContent, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="agreement-${data.id.slice(0, 8)}.html"`,
    },
  });
}

function buildPdfHtml(data: {
  id: string;
  agreement_text: string;
  full_name: string;
  user_email: string;
  ip_address: string | null;
  agreement_version: string;
  created_at: string;
}): string {
  const signedDate = new Date(data.created_at).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const escapedText = data.agreement_text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Agreement ${data.id.slice(0, 8)}</title>
  <style>
    @media print { body { margin: 0; } }
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #111827; line-height: 1.6; }
    .header { text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #16a34a; font-size: 24px; margin: 0; }
    .header p { color: #6b7280; font-size: 14px; margin: 4px 0; }
    .agreement-body { margin-bottom: 40px; white-space: pre-wrap; font-family: inherit; }
    .signature-block { border-top: 2px solid #e5e7eb; padding-top: 24px; margin-top: 40px; }
    .signature-block h3 { margin: 0 0 16px; color: #111827; }
    .sig-row { display: flex; gap: 40px; margin-bottom: 8px; }
    .sig-label { font-weight: bold; min-width: 120px; color: #6b7280; }
    .sig-value { color: #111827; }
    .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>VendingConnector</h1>
    <p>Signed Agreement</p>
    <p>Version ${data.agreement_version} &bull; Agreement ID: ${data.id}</p>
  </div>
  <div class="agreement-body">${escapedText}</div>
  <div class="signature-block">
    <h3>Signature</h3>
    <div class="sig-row"><span class="sig-label">Signed By:</span><span class="sig-value">${data.full_name}</span></div>
    <div class="sig-row"><span class="sig-label">Email:</span><span class="sig-value">${data.user_email}</span></div>
    <div class="sig-row"><span class="sig-label">Date:</span><span class="sig-value">${signedDate}</span></div>
    <div class="sig-row"><span class="sig-label">IP Address:</span><span class="sig-value">${data.ip_address || "N/A"}</span></div>
  </div>
  <div class="footer">
    <p>This document was electronically signed via VendingConnector.com</p>
    <p>Agreement ID: ${data.id}</p>
  </div>
</body>
</html>`;
}
