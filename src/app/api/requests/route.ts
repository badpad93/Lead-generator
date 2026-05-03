import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createRequestSchema } from "@/lib/schemas";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sanitizeSearch } from "@/lib/sanitizeSearch";
import { sendFormConfirmationEmails } from "@/lib/confirmationEmail";

const PAGE_SIZE = 12;

/** Determine the role and profile info of the requesting user (if authenticated) */
async function getRequesterInfo(req: NextRequest): Promise<{
  id: string;
  role: string;
  state: string | null;
} | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role, state")
    .eq("id", userId)
    .single();
  if (!data) return null;
  return { id: userId, role: data.role, state: data.state ?? null };
}

/**
 * Strip location request data for operator accounts.
 * Operators can only see business industry (location_type) and zip code.
 */
function stripRequestForOperators(request: Record<string, unknown>): Record<string, unknown> {
  return {
    ...request,
    location_name: "Location",
    address: null,
    city: null,
    description: null,
    contact_preference: null,
    profiles: null,
    // Keep: id, title, zip, state, location_type, machine_types_wanted,
    //       estimated_daily_traffic, commission_offered, commission_notes,
    //       urgency, status, views, created_at, updated_at, is_public
  };
}

/** GET /api/requests — list vending requests with filters */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const search = params.get("search");
    const locationType = params.get("location_type");
    const state = params.get("state");
    const urgency = params.get("urgency");
    const commission = params.get("commission");
    const status = params.get("status");
    const machineTypes = params.get("machine_types");
    const page = Math.max(0, parseInt(params.get("page") || "0"));
    const perPage = Math.min(100, Math.max(1, parseInt(params.get("per_page") || String(PAGE_SIZE))));
    const mine = params.get("mine");
    const saved = params.get("saved");
    const userId = params.get("user_id");

    // Determine requester info
    const requester = await getRequesterInfo(req);
    const isOperator = requester?.role === "operator";

    let query = supabaseAdmin
      .from("vending_requests")
      .select("*, profiles(id, full_name, company_name, verified)", { count: "exact" });

    // If requesting own requests, need auth context via header
    if (mine === "true" && userId) {
      query = query.eq("created_by", userId);
    } else if (saved === "true" && userId) {
      // Get saved request IDs first
      const { data: savedData } = await supabaseAdmin
        .from("saved_requests")
        .select("request_id")
        .eq("operator_id", userId);
      const savedIds = savedData?.map((s) => s.request_id) || [];
      if (savedIds.length === 0) {
        return NextResponse.json({ requests: [], total: 0 });
      }
      query = query.in("id", savedIds);
    } else {
      // Public view: only show public requests
      query = query.eq("is_public", true);

      // Exclude leads that have already been purchased by anyone
      const { data: purchasedRows } = await supabaseAdmin
        .from("lead_purchases")
        .select("request_id")
        .eq("status", "completed");
      const purchasedIds = purchasedRows?.map((r) => r.request_id) ?? [];
      if (purchasedIds.length > 0) {
        query = query.not("id", "in", `(${purchasedIds.join(",")})`);
      }
    }

    // Exclude locations with missing or unknown city/state
    query = query
      .neq("city", "").neq("state", "")
      .not("city", "is", null).not("state", "is", null)
      .neq("city", "Unknown").neq("state", "Unknown")
      .neq("city", "unknown").neq("state", "unknown");

    if (search) {
      const s = sanitizeSearch(search);
      if (s) {
        if (isOperator) {
          query = query.or(`state.ilike.%${s}%,zip.ilike.%${s}%,title.ilike.%${s}%`);
        } else {
          query = query.or(`city.ilike.%${s}%,state.ilike.%${s}%,title.ilike.%${s}%`);
        }
      }
    }
    if (locationType) query = query.eq("location_type", locationType);
    if (state) query = query.eq("state", state);
    if (urgency) query = query.eq("urgency", urgency);
    if (commission === "true") query = query.eq("commission_offered", true);

    // "matched" filter: show open leads in the operator's served states
    if (status === "matched" && requester) {
      query = query.eq("status", "open");
      // Get operator's states from profile + operator_listings
      const operatorStates = new Set<string>();
      if (requester.state) operatorStates.add(requester.state);
      const { data: listings } = await supabaseAdmin
        .from("operator_listings")
        .select("states_served")
        .eq("operator_id", requester.id);
      for (const l of listings || []) {
        for (const s of l.states_served || []) operatorStates.add(s);
      }
      if (operatorStates.size > 0) {
        query = query.in("state", Array.from(operatorStates));
      } else {
        return NextResponse.json({ requests: [], total: 0 });
      }
    } else if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (machineTypes) {
      const types = machineTypes.split(",");
      query = query.overlaps("machine_types_wanted", types);
    }

    const from = page * perPage;
    const to = from + perPage - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Strip sensitive fields from browse results
    let requests = data || [];
    if (isOperator) {
      requests = requests.map((r: Record<string, unknown>) => stripRequestForOperators(r));
    } else {
      // Everyone: hide business name, address, zip in browse view
      requests = requests.map((r: Record<string, unknown>) => {
        // Remove business name from title (old format: "Type — BusinessName")
        const title = typeof r.title === "string" && (r.title as string).includes(" — ")
          ? (r.title as string).split(" — ")[0]
          : r.title;
        return {
          ...r,
          title,
          location_name: null,
          address: null,
          zip: null,
        };
      });
    }

    return NextResponse.json({ requests, total: count || 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/requests — create a new vending request */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("vending_requests")
      .insert({
        created_by: userId,
        ...parsed.data,
        is_public: false, // All submissions require admin approval before going public
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
        const email = authUser?.user?.email ?? null;
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .single();
        await sendFormConfirmationEmails({
          formName: "Vending Location Request",
          submitterEmail: email,
          submitterName: profile?.full_name ?? null,
          fields: [
            { label: "Title", value: d.title },
            { label: "Location Name", value: d.location_name },
            { label: "City", value: d.city },
            { label: "State", value: d.state },
            { label: "ZIP", value: d.zip },
            { label: "Location Type", value: d.location_type },
            { label: "Machine Types", value: d.machine_types_wanted?.join(", ") },
            { label: "Daily Traffic", value: d.estimated_daily_traffic },
            { label: "Commission Offered", value: d.commission_offered },
            { label: "Urgency", value: d.urgency },
            { label: "Description", value: d.description },
          ],
          adminSubject: `New Vending Request: ${d.title} — ${d.city}, ${d.state}`,
        });
      } catch (e) {
        console.error("[requests] confirmation email error", e);
      }
    })();

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
