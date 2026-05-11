import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { to, message } = body as { to: string; message?: string };

  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Valid email address required" }, { status: 400 });
  }

  const { data: resource, error: rErr } = await supabaseAdmin
    .from("sales_resources")
    .select("*")
    .eq("id", id)
    .single();

  if (rErr || !resource) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured" }, { status: 500 });
  }

  let fileContent: Buffer;
  try {
    const resp = await fetch(resource.file_url);
    if (!resp.ok) throw new Error(`Failed to fetch file: ${resp.status}`);
    fileContent = Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    return NextResponse.json({ error: `Could not download file: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const messageHtml = message?.trim()
    ? `<p>${message.replace(/\n/g, "<br/>")}</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>`
    : "";

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Resource: ${resource.title}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111827;">
          ${messageHtml}
          <p>Please find the attached resource: <strong>${resource.title}</strong></p>
          ${resource.description ? `<p style="color:#6b7280;font-size:14px;">${resource.description}</p>` : ""}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
          <p style="text-align:center;font-size:12px;color:#9ca3af;">Apex AI Vending</p>
        </div>
      `,
      attachments: [
        {
          filename: resource.file_name || "resource",
          content: fileContent,
        },
      ],
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message || String(result.error) }, { status: 500 });
    }

    return NextResponse.json({ ok: true, to });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
