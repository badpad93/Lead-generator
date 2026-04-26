import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ViewerContext = "admin" | "internal_user" | "customer";

interface LocationPreliminary {
  id: string;
  industry: string | null;
  zip: string | null;
  employee_count: number | null;
  traffic_count: number | null;
  is_revealed: boolean;
  created_at: string;
  updated_at: string;
}

interface LocationFull extends LocationPreliminary {
  location_name: string | null;
  address: string | null;
  phone: string | null;
  decision_maker_name: string | null;
  decision_maker_email: string | null;
  revealed_at: string | null;
}

export type LocationForUser = LocationPreliminary | LocationFull;

const SENSITIVE_FIELDS = [
  "location_name",
  "address",
  "phone",
  "decision_maker_name",
  "decision_maker_email",
  "revealed_at",
] as const;

export async function getLocationForUser(
  locationId: string,
  viewerContext: ViewerContext
): Promise<LocationForUser | null> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .single();

  if (error || !data) return null;

  if (viewerContext === "admin" || viewerContext === "internal_user") {
    return data as LocationFull;
  }

  // Customer context: strip sensitive fields unless revealed
  if (data.is_revealed) {
    return data as LocationFull;
  }

  return pickPreliminaryFields(data);
}

function pickPreliminaryFields(data: Record<string, unknown>): LocationPreliminary {
  return {
    id: data.id as string,
    industry: (data.industry as string | null) ?? null,
    zip: (data.zip as string | null) ?? null,
    employee_count: (data.employee_count as number | null) ?? null,
    traffic_count: (data.traffic_count as number | null) ?? null,
    is_revealed: (data.is_revealed as boolean) ?? false,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}

export function stripSensitiveFields(
  location: Record<string, unknown>
): LocationPreliminary {
  return pickPreliminaryFields(location);
}
