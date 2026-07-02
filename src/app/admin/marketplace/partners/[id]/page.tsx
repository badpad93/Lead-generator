"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowLeft, CheckCircle2, XCircle, Building2, Mail, Phone,
  MapPin, Briefcase, FileText, Shield, Ban, Activity, User,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface PartnerDetail {
  partner: {
    id: string;
    business_name: string | null;
    bio: string | null;
    partner_type: string;
    onboarding_complete: boolean;
    active: boolean;
    identity_verified_at: string | null;
    w9_uploaded_at: string | null;
    agreement_signed_at: string | null;
    bank_verified_at: string | null;
    capacity: number;
    contracts_completed: number;
    lifetime_earnings: number;
    pending_earnings: number;
    partner_score: number | null;
    partner_tier: "bronze" | "silver" | "gold" | null;
    partner_tier_override: "bronze" | "silver" | "gold" | null;
    partner_tier_computed_at: string | null;
    submissions_accepted_count: number | null;
    submissions_total_count: number | null;
    rating: number | null;
    rating_count: number | null;
    created_at: string;
  };
  profile: { full_name: string; email: string; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null } | null;
  territories: Array<{ id: string; state: string | null; city: string | null; travel_radius_miles: number | null }>;
  industries: Array<{ id: string; industry: string }>;
  documents: Array<{ id: string; document_type: string; file_url: string | null; file_name: string | null; uploaded_at: string; verified_at: string | null }>;
  bank_accounts: Array<{ id: string; method: string; bank_name: string | null; account_last4: string | null; verified_at: string | null }>;
  activity: Array<{ id: string; activity_type: string; description: string | null; created_at: string }>;
}

export default function AdminPartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [data, setData] = useState<PartnerDetail | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/admin/marketplace/partners/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/partners"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, extra: Record<string, unknown> = {}) {
    setSaving(action);
    const res = await fetch(`/api/admin/marketplace/partners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Action failed");
    }
    await load();
    setSaving(null);
  }

  async function verifyDocument(docId: string, verify: boolean) {
    setSaving(`doc-${docId}`);
    await fetch(`/api/admin/marketplace/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: verify ? "verify" : "unverify" }),
    });
    await load();
    setSaving(null);
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const { partner, profile, territories, industries, documents, bank_accounts, activity } = data;

  const VerifyChip = ({ done, label, onClick, disabled }: { done: boolean; label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer disabled:opacity-50 ${done ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </button>
  );

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/admin/marketplace/partners" className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Partners
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {partner.partner_type === "individual" ? <User className="h-5 w-5 text-green-primary" /> : <Building2 className="h-5 w-5 text-green-primary" />}
            {partner.business_name || profile?.full_name || "Partner"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{partner.partner_type.replace(/_/g, " ")}</p>
        </div>
        <div className="flex items-center gap-2">
          {partner.active ? (
            <button
              onClick={() => {
                const reason = prompt("Reason for deactivating (optional):") || "";
                doAction("deactivate", { reason });
              }}
              disabled={saving === "deactivate"}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer disabled:opacity-50"
            >
              <Ban className="inline h-3.5 w-3.5 mr-1" /> Deactivate
            </button>
          ) : (
            <button
              onClick={() => doAction("activate")}
              disabled={saving === "activate"}
              className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 cursor-pointer disabled:opacity-50"
            >
              Activate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Contact */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2"><User className="h-4 w-4 text-gray-400 mt-0.5" /><div><p className="text-xs text-gray-400">Name</p><p>{profile?.full_name || "—"}</p></div></div>
              <div className="flex items-start gap-2"><Mail className="h-4 w-4 text-gray-400 mt-0.5" /><div><p className="text-xs text-gray-400">Email</p><p>{profile?.email || "—"}</p></div></div>
              <div className="flex items-start gap-2"><Phone className="h-4 w-4 text-gray-400 mt-0.5" /><div><p className="text-xs text-gray-400">Phone</p><p>{profile?.phone || "—"}</p></div></div>
              <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-gray-400 mt-0.5" /><div><p className="text-xs text-gray-400">Address</p><p>{[profile?.address, profile?.city, profile?.state, profile?.zip].filter(Boolean).join(", ") || "—"}</p></div></div>
            </div>
            {partner.bio && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Bio</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{partner.bio}</p>
              </div>
            )}
          </div>

          {/* Territories */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" /> Service Territories</h3>
            {territories.length === 0 ? (
              <p className="text-sm text-gray-400">No territories set.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {territories.map((t) => (
                  <span key={t.id} className="rounded-full bg-blue-50 text-blue-700 text-xs px-3 py-1 font-medium">
                    {t.city ? `${t.city}, ${t.state}` : t.state}{t.travel_radius_miles ? ` · ${t.travel_radius_miles}mi` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Industries */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Briefcase className="h-4 w-4 text-gray-400" /> Target Industries</h3>
            {industries.length === 0 ? (
              <p className="text-sm text-gray-400">No industries selected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {industries.map((i) => (
                  <span key={i.id} className="rounded-full bg-purple-50 text-purple-700 text-xs px-3 py-1 font-medium">{i.industry}</span>
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /> Documents</h3>
            {documents.length === 0 ? (
              <p className="text-sm text-gray-400">No documents uploaded.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase ${d.document_type === "w9" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                        {d.document_type}
                      </span>
                      <div>
                        <p className="text-sm text-gray-900">{d.file_name || "Document"}</p>
                        <p className="text-xs text-gray-400">Uploaded {new Date(d.uploaded_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-primary hover:underline">
                          View
                        </a>
                      )}
                      <button
                        onClick={() => verifyDocument(d.id, !d.verified_at)}
                        disabled={saving === `doc-${d.id}`}
                        className={`rounded-lg px-3 py-1 text-xs font-medium cursor-pointer disabled:opacity-50 ${d.verified_at ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                      >
                        {d.verified_at ? "Verified" : "Verify"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-gray-400" /> Activity</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-400">No activity yet.</p>
            ) : (
              <div className="space-y-2.5">
                {activity.slice(0, 12).map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />
                    <div className="flex-1">
                      <p className="text-gray-700">{a.description || a.activity_type}</p>
                      <p className="text-[10px] text-gray-400">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Verification Actions */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Shield className="h-4 w-4 text-gray-400" /> Verification</h3>
            <div className="space-y-2">
              <VerifyChip
                done={!!partner.identity_verified_at}
                label={partner.identity_verified_at ? "Identity Verified" : "Verify Identity"}
                disabled={saving === "verify_identity" || saving === "unverify_identity"}
                onClick={() => doAction(partner.identity_verified_at ? "unverify_identity" : "verify_identity")}
              />
              <VerifyChip
                done={!!partner.w9_uploaded_at}
                label={partner.w9_uploaded_at ? "W-9 Verified" : "Mark W-9 Verified"}
                disabled={saving === "verify_w9"}
                onClick={() => doAction("verify_w9")}
              />
              <VerifyChip
                done={!!partner.agreement_signed_at}
                label={partner.agreement_signed_at ? "Agreement Signed" : "Mark Agreement Signed"}
                disabled={saving === "sign_agreement"}
                onClick={() => doAction("sign_agreement")}
              />
              <VerifyChip
                done={!!partner.bank_verified_at}
                label={partner.bank_verified_at ? "Bank Verified" : "Mark Bank Verified"}
                disabled={saving === "verify_bank"}
                onClick={() => doAction("verify_bank")}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Stats</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Capacity</dt><dd className="font-medium">{partner.capacity}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Contracts Completed</dt><dd className="font-medium">{partner.contracts_completed}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Lifetime Earnings</dt><dd className="font-medium">${Number(partner.lifetime_earnings).toLocaleString("en-US", { minimumFractionDigits: 2 })}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Pending</dt><dd className="font-medium">${Number(partner.pending_earnings).toLocaleString("en-US", { minimumFractionDigits: 2 })}</dd></div>
            </dl>
            <button
              onClick={() => {
                const val = prompt("Set capacity (max concurrent contracts):", String(partner.capacity));
                if (val !== null) doAction("set_capacity", { capacity: Number(val) });
              }}
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Set Capacity
            </button>
          </div>

          {/* Tier & Score */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Tier & Score</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Auto Tier</dt>
                <dd className={`font-medium capitalize ${
                  partner.partner_tier === "gold" ? "text-yellow-700"
                    : partner.partner_tier === "silver" ? "text-slate-700"
                    : "text-amber-700"
                }`}>{partner.partner_tier || "bronze"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Score</dt>
                <dd className="font-medium">{partner.partner_score != null ? `${Number(partner.partner_score).toFixed(1)} / 100` : "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Submissions</dt>
                <dd className="font-medium">{partner.submissions_accepted_count ?? 0} / {partner.submissions_total_count ?? 0} accepted</dd>
              </div>
              {partner.partner_tier_override && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Pinned Override</dt>
                  <dd className="font-medium capitalize text-blue-700">{partner.partner_tier_override}</dd>
                </div>
              )}
              {partner.partner_tier_computed_at && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Last recomputed</dt>
                  <dd className="text-xs text-gray-400">{new Date(partner.partner_tier_computed_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-1.5">
              {(["bronze", "silver", "gold"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => doAction("set_tier_override", { tier: t })}
                  disabled={saving === "set_tier_override"}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium capitalize cursor-pointer transition-colors ${
                    partner.partner_tier_override === t
                      ? "border-green-primary bg-green-50 text-green-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Pin {t}
                </button>
              ))}
              <button
                onClick={() => doAction("set_tier_override", { tier: null })}
                disabled={saving === "set_tier_override"}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Clear
              </button>
            </div>
            <button
              onClick={() => doAction("recompute_score")}
              disabled={saving === "recompute_score"}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Recompute Score
            </button>
          </div>

          {/* Bank */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Bank / Payout</h3>
            {bank_accounts.length === 0 ? (
              <p className="text-sm text-gray-400">No bank on file.</p>
            ) : (
              bank_accounts.map((b) => (
                <div key={b.id} className="text-sm">
                  <p className="font-medium">{b.bank_name || "Bank"} — ending {b.account_last4 || "••••"}</p>
                  <p className="text-xs text-gray-400 capitalize">{b.method.replace(/_/g, " ")}</p>
                  {b.verified_at && <p className="text-xs text-green-primary mt-1">✓ Verified</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
