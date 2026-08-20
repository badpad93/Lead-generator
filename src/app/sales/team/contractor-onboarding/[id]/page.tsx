"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Send,
  Link2,
  Ban,
  CheckCircle2,
  Clock,
  FileText,
  Download,
  ShieldCheck,
  AlertCircle,
  Mail,
  User,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

/**
 * Admin detail page for a single contractor onboarding record.
 * Reachable from CRM → Team → click the status on a member row (or
 * from the notification email's "View Onboarding Packet" CTA).
 *
 * Elevated-role gate is enforced by the API endpoints — this page
 * uses viewer_role from the GET response to hide restricted actions
 * (W-9 download, packet download) for sales managers.
 */

interface OnboardingDetail {
  id: string;
  contractor_name: string | null;
  contractor_email: string;
  payee_legal_name: string | null;
  contractor_business_name: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  phone_number: string | null;
  state_of_residence: string | null;
  start_date: string;
  status: string;
  agreement_version: string;
  sent_at: string | null;
  first_opened_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  locked: boolean;
  send_count: number;
  last_resent_at: string | null;
  revoked_at: string | null;
  token_expires_at: string;
  w9_received: boolean;
  w9_uploaded_at: string | null;
  w9_original_filename: string | null;
  payment_verified: boolean;
  payment_verified_at: string | null;
  packet_available: boolean;
}

interface SignatureRow {
  document_key: string;
  document_version: string;
  signature_type: string;
  typed_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

export default function ContractorOnboardingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<OnboardingDetail | null>(null);
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [viewerRole, setViewerRole] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "resend" | "copy" | "revoke" | "packet" | "w9">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      setToken(session?.access_token ?? "");
    })();
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!token || !id) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/contractor-onboarding/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
      } else {
        setDetail(data.onboarding);
        setSignatures(data.signatures ?? []);
        setViewerRole(data.viewer_role ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const canRestricted = viewerRole && viewerRole !== "sales_manager";

  async function handleResend() {
    setBusy("resend");
    setMessage(null);
    setCopiedUrl(null);
    try {
      const res = await fetch(`/api/admin/contractor-onboarding/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ send: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
      } else {
        setMessage(`Invitation email resent. New link expires ${new Date(data.expires_at).toLocaleDateString()}.`);
        void fetchDetail();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  async function handleCopyLink() {
    setBusy("copy");
    setMessage(null);
    setCopiedUrl(null);
    try {
      const res = await fetch(`/api/admin/contractor-onboarding/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ send: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
      } else {
        setCopiedUrl(data.url);
        try {
          await navigator.clipboard.writeText(data.url);
          setMessage("Secure link generated and copied to your clipboard. The previous link is now invalid.");
        } catch {
          setMessage("Secure link generated. Copy it below manually — the previous link is now invalid.");
        }
        void fetchDetail();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  async function handleRevoke() {
    if (!window.confirm("Revoke this invitation? The current link will stop working immediately.")) return;
    setBusy("revoke");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/contractor-onboarding/${id}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
      } else {
        setMessage("Invitation revoked.");
        void fetchDetail();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  async function handleDownload(kind: "packet" | "w9") {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/contractor-onboarding/${id}/download?kind=${kind}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (HTTP ${res.status})`);
      } else {
        // Open in a new tab. The signed URL is short-lived, so we
        // don't persist it in state.
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading onboarding…
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/sales/team" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-600 mb-4">
        <ArrowLeft className="h-4 w-4" />
        Back to Team
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {detail.contractor_name || detail.contractor_email}
          </h1>
          <p className="text-sm text-gray-500">Contractor Onboarding</p>
        </div>
        <StatusPill status={detail.status} />
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{message}</p>
            {copiedUrl && (
              <p className="mt-1 break-all text-[11px] text-green-700 font-mono bg-white/60 px-2 py-1 rounded border border-green-200">
                {copiedUrl}
              </p>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Contractor + status card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card title="Contractor">
          <KV k="Name" v={detail.contractor_name ?? "—"} icon={User} />
          <KV k="Email" v={detail.contractor_email} icon={Mail} />
          <KV k="Payee legal name" v={detail.payee_legal_name ?? "—"} />
          <KV k="Business" v={detail.contractor_business_name ?? "—"} />
          <KV k="Phone" v={detail.phone_number ?? "—"} />
          <KV k="State of residence" v={detail.state_of_residence ?? "—"} />
        </Card>
        <Card title="Timeline">
          <KV k="Start date" v={fmtDate(detail.start_date)} icon={Clock} />
          <KV k="Invitation sent" v={fmtDateTime(detail.sent_at)} />
          <KV k="First opened" v={fmtDateTime(detail.first_opened_at)} />
          <KV k="Started" v={fmtDateTime(detail.started_at)} />
          <KV k="Completed" v={fmtDateTime(detail.completed_at)} />
          <KV k="Link expires" v={fmtDateTime(detail.token_expires_at)} />
          <KV k="Total sends" v={String(detail.send_count)} />
        </Card>
      </div>

      {/* Document status */}
      <Card title="Documents" className="mb-6">
        <DocRow label="Contractor Agreement" complete={!!detail.completed_at} note={detail.completed_at ? "Signed" : "Not signed"} />
        <DocRow label="Commission Agreement" complete={!!detail.completed_at} note={detail.completed_at ? "Signed" : "Not signed"} />
        <DocRow label="Confidentiality Agreement" complete={!!detail.completed_at} note={detail.completed_at ? "Signed" : "Not signed"} />
        <DocRow label="Sales Policy" complete={!!detail.completed_at} note={detail.completed_at ? "Signed" : "Not signed"} />
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        {detail.packet_available && canRestricted && (
          <button
            type="button"
            onClick={() => handleDownload("packet")}
            disabled={busy === "packet"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy === "packet" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            View Signed Packet
          </button>
        )}
        {/* Download W-9 removed with the packet-flow simplification —
            W-9s are handled outside the digital onboarding surface. */}
        {detail.status !== "completed" && detail.status !== "revoked" && (
          <>
            <button
              type="button"
              onClick={handleResend}
              disabled={busy === "resend"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "resend" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Resend Invitation
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={busy === "copy"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Copy Secure Link
            </button>
            {canRestricted && (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={busy === "revoke"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {busy === "revoke" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Cancel Invitation
              </button>
            )}
          </>
        )}
      </div>

      {/* Signature audit trail */}
      {signatures.length > 0 && (
        <Card title="Signature Audit Trail">
          <div className="divide-y divide-gray-100 -mx-4">
            {signatures.map((s) => (
              <div key={`${s.document_key}-${s.document_version}`} className="px-4 py-3 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-semibold text-gray-900">{labelForDoc(s.document_key)}</p>
                  <span className="text-gray-500">{fmtDateTime(s.signed_at)}</span>
                </div>
                <p className="text-gray-600">
                  Signed by <span className="font-medium">{s.typed_name || "—"}</span> ({s.signature_type})
                </p>
                <p className="text-gray-400 mt-0.5">
                  Version {s.document_version}
                  {s.ip_address && ` · IP ${s.ip_address}`}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function KV({ k, v, icon: Icon }: { k: string; v: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500 shrink-0 flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
        {k}
      </span>
      <span className="text-gray-900 text-right">{v}</span>
    </div>
  );
}

function DocRow({ label, complete, note }: { label: string; complete: boolean; note: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <Clock className="h-4 w-4 text-gray-300" />
        )}
        <span className={complete ? "text-gray-900 font-medium" : "text-gray-500"}>{label}</span>
      </div>
      <span className="text-xs text-gray-500">{note}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
    not_started: { label: "Not Started", className: "bg-gray-100 text-gray-700", icon: Clock },
    sent: { label: "Sent", className: "bg-blue-50 text-blue-700", icon: Send },
    opened: { label: "Opened", className: "bg-yellow-50 text-yellow-700", icon: Mail },
    in_progress: { label: "In Progress", className: "bg-orange-50 text-orange-700", icon: Clock },
    completed: { label: "Completed", className: "bg-green-50 text-green-700", icon: ShieldCheck },
    needs_attention: { label: "Needs Attention", className: "bg-red-50 text-red-700", icon: AlertCircle },
    revoked: { label: "Revoked", className: "bg-gray-100 text-gray-500 line-through", icon: Ban },
    expired: { label: "Expired", className: "bg-gray-100 text-gray-500", icon: Clock },
  };
  const cfg = map[status] ?? map.not_started;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function labelForDoc(key: string): string {
  return (
    {
      independent_contractor_agreement: "Independent Contractor Agreement",
      commission_agreement: "Commission Agreement",
      confidentiality_agreement: "Confidentiality Agreement",
      sales_policy: "Sales / CRM Policy",
      payment_authorization: "Payment Authorization",
    } as Record<string, string>
  )[key] ?? key;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
