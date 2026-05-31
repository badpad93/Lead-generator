import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.full_name?.trim()) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }
    if (!body.email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!body.job_posting_id) {
      return NextResponse.json({ error: "Job posting is required" }, { status: 400 });
    }

    const { data: job } = await supabaseAdmin
      .from("job_postings")
      .select("id, active")
      .eq("id", body.job_posting_id)
      .single();

    if (!job || !job.active) {
      return NextResponse.json({ error: "This position is no longer available" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .insert({
        job_posting_id: body.job_posting_id,
        full_name: body.full_name.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone?.trim() || null,
        resume_url: body.resume_url || null,
        cover_letter: body.cover_letter?.trim() || null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ application: data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
