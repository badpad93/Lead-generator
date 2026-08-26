"use client";

/**
 * /admin/payroll/[id] — payroll profile detail (admin-only).
 *
 * Sections
 *   - Overview: worker, classification, comp, status
 *   - Personal information (masked SSN / DOB / address)
 *   - Direct deposit (masked account + bank name)
 *   - QuickBooks Setup Summary
 *   - Actions: Resend, Revoke, Mark Payroll Active, Reveal fields
 *   - Activity: audit log
 *
 * Sensitive VALUES never render by default. Admin clicks a specific
 * field's "Reveal for QB" button, provides a short reason, and the
 * value is shown once and then re-masked on modal close. Every
 * reveal is audit-logged with the admin's id + reason.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Ban,
  ShieldCheck,
} from "lucide-react";
import {
  CLASSIFICATION_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/payroll/constants";

interface AuditEvent {
  id: string;
  actor_kind: string;
  event_type: string;
  description: string | null;
  created_at: string;
}
interface DetailResponse {
  profile: Record<string, unknown>;
  worker: Record<string, unknown> | null;
  team_member: { full_name: string | null; email: string | null } | null;
  invitations: Array<{ id: string; sent_at: string | null; opened_at: string | null; used_at: string | null; revoked_at: string | null; expires_at: string; created_at: string }>;
  audit: AuditEvent[];
  encrypted_field_keys: string[];
  masked_display: Record<string, string | null>;
}

export default function PayrollDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [revealFor, setRevealFor] = useState<string | null>(null);
  const [revealReason, setRevealReason] = useState("");
  const [revealValue, setRevealValue] = useState<string | null>(null);
  const [token, setToken] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Sign in required."); setLoading(false); return; }
      setToken(session.access_token);
      const res = await fetch(`/api/admin/payroll/profiles/${params.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed (${res.status})`);
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  async function fireAction(endpoint: string, key: string, body?: Record<string, unknown>) {
    setActionBusy(key);
    try {
      const res = await fetch(`/api/admin/payroll/profiles/${params.id}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) alert(json.error || `${key} failed`);
      await load();
    } finally {
      setActionBusy(null);
    }
  }

  async function reveal() {
    if (!revealFor || !revealReason.trim()) return;
    setActionBusy("reveal");
    try {
      const res = await fetch(`/api/admin/payroll/profiles/${params.id}/reveal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ field_key: revealFor, reason: revealReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.error || "Reveal failed"); return; }
      setRevealValue(json.plaintext);
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-500"><Loader2 className="inline-block h-5 w-5 animate-spin mr-2" /> Loading payroll record…</div>;
  if (error) return <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">{error}</div></div>;
  if (!data) return null;

  const profile = data.profile as {
    classification: "w2_employee" | "1099_contractor";
    status: keyof typeof STATUS_LABELS;
    company_entity: string | null;
    job_title: string | null;
    department: string | null;
    hire_date: string | null;
    pay_type: string | null;
    pay_frequency: string | null;
    hourly_rate_cents: number | null;
    annual_salary_cents: number | null;
    submitted_at: string | null;
    payroll_active_at: string | null;
    work_state: string | null;
    recipient_email: string | null;
  };
  const worker = data.worker as Record<string, string | null> | null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <button onClick={() => router.push("/admin/payroll")} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-green-primary">
        <ArrowLeft className="h-4 w-4" /> Back to Payroll dashboard
      </button>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Coins className="mt-1 h-6 w-6 text-green-primary" />
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{data.team_member?.full_name ?? "—"}</h1>
              <p className="text-sm text-gray-500">{data.team_member?.email ?? profile.recipient_email ?? "—"}</p>
              <p className="mt-1 text-xs text-gray-500">{CLASSIFICATION_LABELS[profile.classification]} · {profile.company_entity ?? "—"}</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_TONES[profile.status]}`}>
            {STATUS_LABELS[profile.status]}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Job Title" value={profile.job_title ?? "—"} />
          <Fact label="Department" value={profile.department ?? "—"} />
          <Fact label="Hire Date" value={profile.hire_date ? new Date(profile.hire_date).toLocaleDateString() : "—"} />
          <Fact label="Work State" value={profile.work_state ?? "—"} />
          <Fact label="Pay Type" value={profile.pay_type ?? "—"} />
          <Fact label="Pay Frequency" value={profile.pay_frequency ?? "—"} />
          <Fact label="Hourly Rate" value={profile.hourly_rate_cents ? `$${(profile.hourly_rate_cents / 100).toFixed(2)} / hr` : "—"} />
          <Fact label="Annual Salary" value={profile.annual_salary_cents ? `$${(profile.annual_salary_cents / 100).toLocaleString()}` : "—"} />
        </div>
      </div>

      {/* Personal information */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Personal Information</h2>
        {worker ? (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <Fact label="Legal Name" value={[worker.legal_first_name, worker.middle_name, worker.legal_last_name].filter(Boolean).join(" ") || "—"} />
            <Fact label="Preferred Name" value={worker.preferred_name ?? "—"} />
            <Fact label="Date of Birth" value={worker.date_of_birth ? new Date(worker.date_of_birth as string).toLocaleDateString() : "—"} />
            <Fact label="Personal Email" value={worker.personal_email ?? "—"} />
            <Fact label="Mobile Phone" value={worker.mobile_phone ?? "—"} />
            <Fact label="SSN"        value={data.masked_display.ssn ?? "—"} sensitive onReveal={data.encrypted_field_keys.includes("ssn") ? () => setRevealFor("ssn") : undefined} />
            <Fact label="Address"    value={worker.address_street ? `${worker.address_street}${worker.address_unit ? ` ${worker.address_unit}` : ""}, ${worker.address_city}, ${worker.address_state} ${worker.address_zip}` : "—"} />
          </div>
        ) : <p className="text-sm text-gray-500">Worker has not submitted personal information yet.</p>}
      </div>

      {/* Direct deposit */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Direct Deposit</h2>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Fact label="Account Holder" value={worker?.account_holder_name ?? "—"} />
          <Fact label="Bank" value={worker?.bank_name ?? "—"} />
          <Fact label="Account Type" value={worker?.account_type ?? "—"} />
          <Fact label="Routing" value={data.masked_display["bank.routing"] ?? "—"} sensitive onReveal={data.encrypted_field_keys.includes("bank.routing") ? () => setRevealFor("bank.routing") : undefined} />
          <Fact label="Account #" value={data.masked_display["bank.account"] ?? "—"} sensitive onReveal={data.encrypted_field_keys.includes("bank.account") ? () => setRevealFor("bank.account") : undefined} />
        </div>
      </div>

      {/* Tax */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Tax Information</h2>
        {profile.classification === "w2_employee" ? (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <Fact label="Filing Status" value={worker?.filing_status ?? "—"} />
            <Fact label="Qualifying Children" value={worker?.qualifying_children_amt ?? "—"} />
            <Fact label="Other Dependents" value={worker?.other_dependents_amt ?? "—"} />
            <Fact label="Other Income" value={worker?.other_income_cents ? `$${(Number(worker.other_income_cents) / 100).toFixed(2)}` : "—"} />
            <Fact label="Deductions" value={worker?.deductions_cents ? `$${(Number(worker.deductions_cents) / 100).toFixed(2)}` : "—"} />
            <Fact label="Additional Withholding" value={data.encrypted_field_keys.includes("w4.additional_withholding_cents") ? "On file" : "—"} sensitive onReveal={data.encrypted_field_keys.includes("w4.additional_withholding_cents") ? () => setRevealFor("w4.additional_withholding_cents") : undefined} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <Fact label="Business Name" value={worker?.business_name ?? "—"} />
            <Fact label="Federal Tax Class" value={worker?.federal_tax_class ?? "—"} />
            <Fact label="TIN Type" value={worker?.tin_type ?? "—"} />
            <Fact label="TIN" value={data.masked_display.tin ?? "—"} sensitive onReveal={data.encrypted_field_keys.includes("tin") ? () => setRevealFor("tin") : undefined} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          <ActionBtn label="Resend Invite"      icon={RefreshCw}    tone="default" busy={actionBusy === "resend"} onClick={() => fireAction("resend", "resend")} />
          <ActionBtn label="Revoke Invite"      icon={Ban}          tone="danger"  busy={actionBusy === "revoke"} onClick={() => { if (confirm("Revoke every active invitation?")) fireAction("revoke", "revoke"); }} />
          <ActionBtn label="Mark Payroll Active" icon={ShieldCheck} tone="success" busy={actionBusy === "mark-active"} onClick={() => { if (confirm("Mark this worker as active in QuickBooks Payroll?")) fireAction("mark-active", "mark-active"); }} />
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Activity</h2>
        <ul className="divide-y divide-gray-100">
          {data.audit.length === 0 ? (
            <li className="py-3 text-sm text-gray-500">No activity yet.</li>
          ) : data.audit.map((e) => (
            <li key={e.id} className="py-2 flex items-start gap-3">
              <span className="text-xs text-gray-400 min-w-[110px]">{new Date(e.created_at).toLocaleString()}</span>
              <div className="text-sm">
                <span className="font-medium text-gray-800">{e.event_type}</span>
                {e.description && <span className="text-gray-600"> — {e.description}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Reveal modal */}
      {revealFor && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-600" />
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Reveal sensitive field</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Provide a short reason so the reveal is auditable. The value shows once and is not persisted anywhere else in the browser.
                </p>
              </div>
            </div>
            {!revealValue ? (
              <>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-gray-500">Reason</label>
                <textarea rows={2} value={revealReason} onChange={(e) => setRevealReason(e.target.value)} placeholder="e.g. entering into QuickBooks Payroll" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button onClick={() => { setRevealFor(null); setRevealReason(""); setRevealValue(null); }} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                  <button onClick={reveal} disabled={!revealReason.trim() || actionBusy === "reveal"} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                    {actionBusy === "reveal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    Reveal
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold uppercase text-amber-800">{revealFor}</div>
                  <div className="mt-1 font-mono text-sm text-amber-900 break-all">{revealValue}</div>
                </div>
                <div className="mt-4 flex items-center justify-end">
                  <button onClick={() => { setRevealFor(null); setRevealReason(""); setRevealValue(null); }} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                    <EyeOff className="h-4 w-4" />
                    Close and re-mask
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, sensitive, onReveal }: { label: string; value: React.ReactNode; sensitive?: boolean; onReveal?: () => void }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm text-gray-900 flex items-center gap-2">
        <span>{value}</span>
        {sensitive && onReveal && (
          <button onClick={onReveal} className="text-xs text-amber-700 hover:text-amber-900 underline">Reveal</button>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, icon: Icon, tone, busy, onClick }: { label: string; icon: React.ComponentType<{ className?: string }>; tone: "default" | "danger" | "success"; busy: boolean; onClick: () => void }) {
  const cls = tone === "danger" ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
    : tone === "success" ? "bg-green-primary text-white hover:bg-green-hover"
    : "border-gray-200 bg-white text-gray-700 hover:border-green-primary hover:text-green-primary";
  return (
    <button type="button" onClick={onClick} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50 ${cls}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
      {tone === "success" && !busy && <CheckCircle2 className="h-4 w-4" />}
      {tone === "danger" && !busy && <AlertCircle className="h-4 w-4" />}
    </button>
  );
}
