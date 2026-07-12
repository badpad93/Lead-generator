import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("sales_accounts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach joined_at — the platform sign-up date of the profile linked to
  // this account by email (case-insensitive). Same field the Admin panel
  // surfaces as "Joined". Null when the account isn't linked to any
  // profile (fresh CRM contact that never signed up).
  const accounts = (data || []) as Array<Record<string, unknown> & { email: string | null }>;
  const emails = Array.from(
    new Set(
      accounts
        .map((a) => (a.email || "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  );

  const joinedByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("email, created_at")
      .in("email", emails);
    for (const p of (profiles || []) as Array<{ email: string; created_at: string }>) {
      const key = (p.email || "").trim().toLowerCase();
      if (!key) continue;
      const prev = joinedByEmail.get(key);
      // If two profiles share an email (rare), take the earliest join.
      if (!prev || new Date(p.created_at).getTime() < new Date(prev).getTime()) {
        joinedByEmail.set(key, p.created_at);
      }
    }
  }

  const withJoined = accounts.map((a) => {
    const key = (a.email || "").trim().toLowerCase();
    return { ...a, joined_at: key ? joinedByEmail.get(key) ?? null : null };
  });

  return NextResponse.json(withJoined);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { business_name, contact_name, phone, email, address, notes, entity_type } = body;
  if (!business_name)
    return NextResponse.json({ error: "business_name required" }, { status: 400 });
  if (!email)
    return NextResponse.json({ error: "email required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("sales_accounts")
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
      entity_type: entity_type || null,
      assigned_to: user.id,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
