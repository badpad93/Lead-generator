import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { sendCoffeeApprovalEmail } from "@/lib/coffeeEmail";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("coffee_applications")
      .select("*, profiles!operator_id(id, full_name, email)")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ applications: data || [] });
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

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Status must be approved or rejected" }, { status: 400 });
    }

    const { data: application, error: appError } = await supabaseAdmin
      .from("coffee_applications")
      .update({
        status,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*, profiles!operator_id(id, full_name, email)")
      .single();

    if (appError) {
      return NextResponse.json({ error: appError.message }, { status: 500 });
    }

    const profileUpdates: Record<string, unknown> = {
      coffee_application_status: status,
    };

    if (status === "approved") {
      profileUpdates.coffee_access_enabled = true;
      profileUpdates.coffee_agreement_signed = true;
    }

    await supabaseAdmin
      .from("profiles")
      .update(profileUpdates)
      .eq("id", application.operator_id);

    if (status === "approved") {
      const profile = application.profiles as { email: string; full_name: string } | null;
      try {
        await sendCoffeeApprovalEmail({
          to: profile?.email || application.email || "",
          contactName: application.contact_name || profile?.full_name || "",
          businessName: application.business_name || "",
        });
      } catch {
        // Email failure should not block approval
      }
    }

    return NextResponse.json({ application });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
