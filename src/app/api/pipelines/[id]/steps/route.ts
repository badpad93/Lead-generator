import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: pipelineId } = await params;
  const body = await req.json();

  if (body.action === "reorder" && Array.isArray(body.steps)) {
    for (const step of body.steps) {
      await supabaseAdmin
        .from("pipeline_steps")
        .update({ order_index: step.order_index })
        .eq("id", step.id);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete" && body.step_id) {
    const { error } = await supabaseAdmin
      .from("pipeline_steps")
      .delete()
      .eq("id", body.step_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "update" && body.step_id) {
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.requires_document !== undefined) updates.requires_document = body.requires_document;
    if (body.requires_signature !== undefined) updates.requires_signature = body.requires_signature;
    if (body.requires_payment !== undefined) updates.requires_payment = body.requires_payment;
    if (body.requires_admin_approval !== undefined) updates.requires_admin_approval = body.requires_admin_approval;
    if (body.payment_amount !== undefined) updates.payment_amount = body.payment_amount;
    if (body.payment_description !== undefined) updates.payment_description = body.payment_description;
    const { data, error } = await supabaseAdmin
      .from("pipeline_steps")
      .update(updates)
      .eq("id", body.step_id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action === "add_document" && body.step_id) {
    const { data, error } = await supabaseAdmin
      .from("step_documents")
      .insert({
        step_id: body.step_id,
        name: body.doc_name || "Document",
        file_type: body.file_type || null,
        required: body.required !== false,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  if (body.action === "remove_document" && body.document_id) {
    const { error } = await supabaseAdmin
      .from("step_documents")
      .delete()
      .eq("id", body.document_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Default: add new step
  const { data: maxStep } = await supabaseAdmin
    .from("pipeline_steps")
    .select("order_index")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = (maxStep?.order_index ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("pipeline_steps")
    .insert({
      pipeline_id: pipelineId,
      name: body.name || "New Step",
      order_index: nextIndex,
      requires_document: body.requires_document || false,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
