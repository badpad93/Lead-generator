import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendLocationRequestConfirmation } from "@/lib/intakeEmail";
import { APEX_ADMIN_NOTIFY } from "@/lib/adminNotifyRecipients";

/**
 * Location services intake. No deposit is collected — the submission creates a
 * sales lead (auto-assigned to the lightest-loaded rep), dedups a sales
 * account, and notifies the location team + the customer. The client then
 * shows a thank-you and routes the visitor to /browse-requests.
 */

const TO_EMAILS = [...APEX_ADMIN_NOTIFY, "louis.cirino@apexaivending.com"];
const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MACHINE_TYPES = ["Combo", "AI", "Water", "Coffee", "ATM"] as const;
type MachineType = (typeof MACHINE_TYPES)[number];
function isMachineType(v: unknown): v is MachineType {
  return typeof v === "string" && (MACHINE_TYPES as readonly string[]).includes(v);
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 500) : "";
}

function err(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

interface Parsed {
  business_name: string; contact_name: string; phone: string; email: string;
  address: string; state: string; zip_code: string; machine_count: number;
  machine_type: MachineType; travel_radius_miles: number | null;
  excluded_industries: string; meeting_availability: string; ref: string;
}

function missingRequired(f: Record<string, string>, zips: string[]): boolean {
  return !f.business_name || !f.contact_name || !f.phone || !f.email || !f.address || !f.state || zips.length === 0;
}

/** Validate the numeric/enumerated fields. */
function parseNumbers(body: Record<string, unknown>): { error: NextResponse } | { machine_count: number; travel: number | null } {
  const machine_count = Number(body.machine_count);
  if (!Number.isFinite(machine_count) || machine_count < 1) return { error: err("Machine count must be a positive number") };
  if (!isMachineType(body.machine_type)) return { error: err(`Machine type must be one of: ${MACHINE_TYPES.join(", ")}`) };
  let travel: number | null = null;
  if (body.travel_radius_miles != null && body.travel_radius_miles !== "") {
    const n = Number(body.travel_radius_miles);
    if (!Number.isFinite(n) || n < 0) return { error: err("Travel radius must be a non-negative number of miles.") };
    travel = Math.round(n);
  }
  return { machine_count, travel };
}

/** Parse + validate the body. Returns an error NextResponse, or the parsed fields. */
function parse(body: Record<string, unknown>): { error: NextResponse } | { data: Parsed } {
  const f = {
    business_name: clean(body.business_name), contact_name: clean(body.contact_name),
    phone: clean(body.phone), email: clean(body.email), address: clean(body.address),
    state: clean(body.state), excluded_industries: clean(body.excluded_industries),
    meeting_availability: clean(body.meeting_availability), ref: clean(body.ref),
  };
  const rawZips = Array.isArray(body.zip_codes) ? body.zip_codes : body.zip_code ? [body.zip_code] : [];
  const zips = rawZips.map((z: unknown) => (typeof z === "string" ? z.trim() : "")).filter(Boolean);

  if (missingRequired(f, zips)) return { error: err("All fields are required") };
  if (!EMAIL_RE.test(f.email)) return { error: err("Invalid email") };

  const nums = parseNumbers(body);
  if ("error" in nums) return { error: nums.error };

  return {
    data: { ...f, zip_code: zips.join(", "), machine_count: nums.machine_count, machine_type: body.machine_type as MachineType, travel_radius_miles: nums.travel },
  };
}

interface Owner { rep: string | null; name: string | null; referral: string | null }

/** Resolve the owning rep: an explicit referral, else the lightest-loaded rep. */
async function resolveOwner(ref: string): Promise<Owner> {
  if (ref) {
    const { data: profile } = await supabaseAdmin.from("profiles").select("id, full_name, role").eq("id", ref).single();
    const roles = ["sales", "admin", "director_of_sales", "market_leader"];
    if (profile && roles.includes(profile.role)) return { rep: profile.id, name: profile.full_name, referral: profile.id };
  }
  try {
    const { pickLeastLoadedSalesRep } = await import("@/lib/salesAutoAssign");
    const pick = await pickLeastLoadedSalesRep({ orderType: "location_services" });
    if (pick) return { rep: pick.userId, name: pick.fullName, referral: null };
  } catch (e) {
    console.error("[request-location] auto-assign failed:", e);
  }
  return { rep: null, name: null, referral: null };
}

function assignedNote(owner: Owner): string {
  if (!owner.name) return "";
  return owner.referral ? ` (referred by ${owner.name})` : ` (auto-assigned to ${owner.name})`;
}

function buildLeadRow(p: Parsed, owner: Owner): Record<string, unknown> {
  const notes = [
    `Location services request — ${p.machine_count} ${p.machine_type} machine(s) requested for ZIP(s) ${p.zip_code} in ${p.state}${assignedNote(owner)}`,
    p.travel_radius_miles != null ? `Willing to travel up to ${p.travel_radius_miles} mi.` : null,
    p.excluded_industries ? `Industries to avoid: ${p.excluded_industries}.` : null,
    p.meeting_availability ? `Availability: ${p.meeting_availability}.` : null,
  ].filter(Boolean).join(" ");
  return {
    business_name: p.business_name, contact_name: p.contact_name, phone: p.phone, email: p.email,
    address: p.address, zip_code: p.zip_code, state: p.state, machine_count: p.machine_count,
    status: "new", source: owner.referral ? "request-location-referral" : "request-location",
    notes, created_by: owner.referral, assigned_to: owner.rep,
    travel_radius_miles: p.travel_radius_miles, excluded_industries: p.excluded_industries || null,
    meeting_availability: p.meeting_availability || null,
  };
}

function stripOptional(row: Record<string, unknown>): Record<string, unknown> {
  const { travel_radius_miles: _t, excluded_industries: _e, meeting_availability: _m, ...rest } = row;
  void _t; void _e; void _m;
  return rest;
}

const insertOnce = (payload: Record<string, unknown>) =>
  supabaseAdmin.from("sales_leads").insert(payload).select("id").single();

/** Insert the sales lead, falling back if optional columns are missing. */
async function insertLead(row: Record<string, unknown>, machine_type: MachineType): Promise<string | null> {
  let { data, error } = await insertOnce({ ...row, machine_type });
  if (error && /travel_radius_miles|excluded_industries|meeting_availability/.test(error.message ?? "")) {
    ({ data, error } = await insertOnce({ ...stripOptional(row), machine_type }));
  }
  if (error && error.message?.includes("machine_type")) {
    ({ data, error } = await insertOnce(stripOptional(row)));
  }
  if (error) console.error("[request-location] db error", error);
  return data?.id ?? null;
}

/** A valid profiles.id for the workflow's customer_id: match by email, else the owning rep. */
async function resolveWorkflowCustomer(email: string, repId: string | null): Promise<string | null> {
  const { data } = await supabaseAdmin.from("profiles").select("id").ilike("email", email.trim()).maybeSingle();
  if (data) return data.id as string;
  return repId;
}

/** Spawn the location-services workflow for the locations team (best-effort). */
async function spawnWorkflow(leadId: string, p: Parsed, owner: Owner): Promise<void> {
  try {
    const customerId = await resolveWorkflowCustomer(p.email, owner.rep);
    if (!customerId) return;
    const { spawnFromLocationRequest } = await import("@/lib/workflows/hooks");
    await spawnFromLocationRequest(leadId, { customerId, quantity: p.machine_count });
  } catch (e) {
    console.error("[request-location] workflow spawn failed:", e);
  }
}

async function createAccount(p: Parsed, owner: Owner): Promise<void> {
  try {
    const { findOrCreateSalesAccount } = await import("@/lib/salesAccountResolver");
    await findOrCreateSalesAccount({
      business_name: p.business_name, contact_name: p.contact_name, phone: p.phone, email: p.email,
      address: p.address, notes: `Auto-created from location services request — ${p.machine_count} machine(s), ZIP(s) ${p.zip_code}, ${p.state}`,
      assigned_to: owner.rep, created_by: owner.referral,
    });
  } catch (e) {
    console.error("[request-location] account creation error", e);
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err("Invalid JSON"); }

  const parsed = parse(body);
  if ("error" in parsed) return parsed.error;
  const p = parsed.data;

  const owner = await resolveOwner(p.ref);
  const leadId = await insertLead(buildLeadRow(p, owner), p.machine_type);
  if (!leadId) return NextResponse.json({ error: "Failed to save request" }, { status: 500 });

  await createAccount(p, owner);
  await spawnWorkflow(leadId, p, owner);
  sendAdminNotification(p).catch((e) => console.error("[request-location] email error", e));
  sendLocationRequestConfirmation({ to: p.email, name: p.contact_name }).catch((e) => console.error("[request-location] confirmation email error", e));

  return NextResponse.json({ ok: true });
}

async function sendAdminNotification(p: Parsed) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#16a34a;margin:0 0 16px;">New Location Services Request</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Business Name</td><td style="padding:6px 0;color:#111827;font-weight:600;">${p.business_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Contact Name</td><td style="padding:6px 0;color:#111827;">${p.contact_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td style="padding:6px 0;color:#111827;">${p.phone}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;color:#111827;">${p.email}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Address</td><td style="padding:6px 0;color:#111827;">${p.address}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">State</td><td style="padding:6px 0;color:#111827;">${p.state}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">ZIP Code(s)</td><td style="padding:6px 0;color:#111827;">${p.zip_code}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Machines Requested</td><td style="padding:6px 0;color:#111827;font-weight:600;">${p.machine_count}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Machine Type</td><td style="padding:6px 0;color:#111827;font-weight:600;">${p.machine_type}</td></tr>
        ${p.travel_radius_miles != null ? `<tr><td style="padding:6px 0;color:#6b7280;">Travel Radius</td><td style="padding:6px 0;color:#111827;">${p.travel_radius_miles} mi</td></tr>` : ""}
        ${p.excluded_industries ? `<tr><td style="padding:6px 0;color:#6b7280;">Industries to Avoid</td><td style="padding:6px 0;color:#111827;">${p.excluded_industries}</td></tr>` : ""}
        ${p.meeting_availability ? `<tr><td style="padding:6px 0;color:#6b7280;">Availability</td><td style="padding:6px 0;color:#111827;">${p.meeting_availability}</td></tr>` : ""}
      </table>
    </div>
  `;
  await resend.emails.send({
    from: FROM_EMAIL,
    to: TO_EMAILS,
    subject: `New Location Services Request – ${p.business_name} (${p.machine_count} location${p.machine_count > 1 ? "s" : ""})`,
    html,
  });
}
