import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { data: jobs, error: jobsErr } = await supabaseAdmin
      .from("job_postings")
      .select("*")
      .order("sort_order", { ascending: true });

    if (jobsErr) {
      return NextResponse.json({ error: jobsErr.message }, { status: 500 });
    }

    const { data: applications, error: appsErr } = await supabaseAdmin
      .from("job_applications")
      .select("*, job_postings(id, title)")
      .order("created_at", { ascending: false });

    if (appsErr) {
      return NextResponse.json({ error: appsErr.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: jobs || [], applications: applications || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const slug =
      body.slug?.trim() ||
      body.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const { data, error } = await supabaseAdmin
      .from("job_postings")
      .insert({
        title: body.title.trim(),
        slug,
        description: body.description?.trim() || "",
        hourly_rate: body.hourly_rate?.trim() || null,
        location_type: body.location_type || "remote",
        employment_type: body.employment_type || "full-time",
        requirements: body.requirements?.trim() || null,
        benefits: body.benefits?.trim() || null,
        active: body.active ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job: data }, { status: 201 });
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
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const allowedFields = [
      "title", "slug", "description", "hourly_rate", "location_type",
      "employment_type", "requirements", "benefits", "active", "sort_order",
    ];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (field in fields) updates[field] = fields[field];
    }

    const { data, error } = await supabaseAdmin
      .from("job_postings")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("job_postings")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
