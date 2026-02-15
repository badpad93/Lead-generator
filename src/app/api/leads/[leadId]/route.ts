import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { updateLeadSchema } from "@/lib/schemas";

/** PATCH /api/leads/[leadId] – update notes / contacted_date */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;

  try {
    const body = await req.json();
    const parsed = updateLeadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.contacted_date !== undefined)
      updates.contacted_date = parsed.data.contacted_date;

    const { data, error } = await supabaseAdmin
      .from("leads")
      .update(updates)
      .eq("id", leadId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
