import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRouteSchema } from "@/lib/schemas";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sanitizeSearch } from "@/lib/sanitizeSearch";
import { sendFormConfirmationEmails } from "@/lib/confirmationEmail";

const PAGE_SIZE = 12;

/** POST /api/routes — authenticated user creates a route listing */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createRouteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("route_listings")
      .insert({
        created_by: userId,
        ...parsed.data,
        status: "pending", // All submissions require admin approval
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send confirmation emails (non-blocking)
    const d = parsed.data;
    (async () => {
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = authUser?.user?.email ?? d.contact_email ?? null;
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .single();
        await sendFormConfirmationEmails({
          formName: "Route for Sale",
          submitterEmail: email,
          submitterName: profile?.full_name ?? null,
          fields: [
            { label: "Title", value: d.title },
            { label: "City", value: d.city },
            { label: "State", value: d.state },
            { label: "Machines", value: d.num_machines },
            { label: "Locations", value: d.num_locations },
            { label: "Monthly Revenue", value: d.monthly_revenue ? `$${d.monthly_revenue.toLocaleString()}` : undefined },
            { label: "Asking Price", value: d.asking_price ? `$${d.asking_price.toLocaleString()}` : undefined },
            { label: "Machine Types", value: d.machine_types?.join(", ") },
            { label: "Includes Equipment", value: d.includes_equipment },
            { label: "Includes Contracts", value: d.includes_contracts },
            { label: "Contact Email", value: d.contact_email },
            { label: "Contact Phone", value: d.contact_phone },
            { label: "Description", value: d.description },
          ],
          adminSubject: `New Route Listing: ${d.title} — ${d.city}, ${d.state}`,
        });
      } catch (e) {
        console.error("[routes] confirmation email error", e);
      }
    })();

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/routes — list active route listings with filters */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const search = params.get("search");
  const state = params.get("state");
  const page = Math.max(0, parseInt(params.get("page") || "0"));

  let query = supabaseAdmin
    .from("route_listings")
    .select("*, profiles!created_by(id, full_name, company_name, verified)", { count: "exact" })
    .eq("status", "active");

  // Exclude locations with missing or unknown city/state
  query = query
    .neq("city", "").neq("state", "")
    .not("city", "is", null).not("state", "is", null)
    .neq("city", "Unknown").neq("state", "Unknown")
    .neq("city", "unknown").neq("state", "unknown");

  if (search) {
    const s = sanitizeSearch(search);
    if (s) query = query.or(`city.ilike.%${s}%,state.ilike.%${s}%,title.ilike.%${s}%`);
  }
  if (state) query = query.eq("state", state);

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ routes: data || [], total: count || 0 });
}
