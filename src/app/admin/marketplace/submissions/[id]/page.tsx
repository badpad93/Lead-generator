"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, MessageSquare, MapPin, User, Phone, Mail, Zap, Car, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Submission {
  id: string;
  business_name: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  employees: number | null;
  traffic_score: number | null;
  decision_maker_name: string | null;
  decision_maker_title: string | null;
  decision_maker_email: string | null;
  decision_maker_phone: string | null;
  power_available: boolean;
  parking_available: boolean;
  machine_recommendation: string | null;
  notes: string | null;
  admin_status: string;
  admin_review_note: string | null;
  admin_reviewed_at: string | null;
  created_at: string;
  contract: { id: string; title: string; tier: number; partner_payout: number; machine_type: string | null } | null;
  partner: { id: string; business_name: string | null } | null;
}

interface Photo {
  id: string;
  file_url: string;
  file_name: string;
  caption: string | null;
}

interface Activity {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  changes_requested: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
};

export default function AdminSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [action, setAction] = useState<"approve" | "request_changes" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/admin/marketplace/submissions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSubmission(data.submission);
      setPhotos(data.photos);
      setActivity(data.activity);
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push(`/login?redirect=/admin/marketplace/submissions/${id}`); return; }
      setToken(session.access_token);
    });
  }, [router, id]);

  useEffect(() => { load(); }, [load]);

  async function submitReview() {
    if (!action) return;
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/marketplace/submissions/${id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else {
      setAction(null);
      setNote("");
      await load();
    }
    setSaving(false);
  }

  if (loading || !submission) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const canReview = submission.admin_status === "pending" || submission.admin_status === "changes_requested";

  return (
    <div className="p-6 max-w-4xl">
      <Link href="/admin/marketplace/submissions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Queue
      </Link>

      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{submission.business_name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500 flex-wrap">
            {submission.contract && (
              <Link href={`/admin/marketplace/contracts/${submission.contract.id}`} className="text-green-primary hover:underline">
                {submission.contract.title}
              </Link>
            )}
            {submission.contract && <span>· Tier {submission.contract.tier}</span>}
            {submission.partner && <span>· by {submission.partner.business_name || "Unknown Partner"}</span>}
            <span>· {new Date(submission.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_COLORS[submission.admin_status] || "bg-gray-100 text-gray-600"}`}>
          {submission.admin_status.replace(/_/g, " ")}
        </span>
      </div>

      {submission.admin_review_note && (
        <div className={`rounded-2xl border p-4 mb-4 ${submission.admin_status === "approved" ? "border-emerald-200 bg-emerald-50" : submission.admin_status === "rejected" ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`}>
          <p className="text-sm font-semibold mb-1 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Prior review note
          </p>
          <p className="text-sm whitespace-pre-wrap">{submission.admin_review_note}</p>
          {submission.admin_reviewed_at && (
            <p className="text-xs mt-1 opacity-60">{new Date(submission.admin_reviewed_at).toLocaleString()}</p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Location */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-400" /> Location
        </h3>
        <p className="text-sm text-gray-700">{submission.address}</p>
        <p className="text-sm text-gray-700">{[submission.city, submission.state, submission.zip].filter(Boolean).join(", ")}</p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-gray-500">Industry</p>
            <p className="font-medium text-gray-900">{submission.industry || "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">Employees</p>
            <p className="font-medium text-gray-900">{submission.employees ?? "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">Traffic</p>
            <p className="font-medium text-gray-900">{submission.traffic_score ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <span className={`flex items-center gap-1 ${submission.power_available ? "text-emerald-700" : "text-gray-400"}`}>
              <Zap className="h-3.5 w-3.5" /> Power
            </span>
            <span className={`flex items-center gap-1 ${submission.parking_available ? "text-emerald-700" : "text-gray-400"}`}>
              <Car className="h-3.5 w-3.5" /> Parking
            </span>
          </div>
        </div>
      </div>

      {/* Decision maker */}
      {(submission.decision_maker_name || submission.decision_maker_email || submission.decision_maker_phone) && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" /> Decision Maker
          </h3>
          <div className="text-sm">
            {submission.decision_maker_name && (
              <p className="font-medium text-gray-900">{submission.decision_maker_name}{submission.decision_maker_title ? `, ${submission.decision_maker_title}` : ""}</p>
            )}
            {submission.decision_maker_email && (
              <p className="text-gray-600 flex items-center gap-1.5 mt-1"><Mail className="h-3.5 w-3.5" /> {submission.decision_maker_email}</p>
            )}
            {submission.decision_maker_phone && (
              <p className="text-gray-600 flex items-center gap-1.5 mt-1"><Phone className="h-3.5 w-3.5" /> {submission.decision_maker_phone}</p>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {submission.notes && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Partner Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.notes}</p>
        </div>
      )}

      {/* Photos */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Site Photos ({photos.length})</h3>
        {photos.length === 0 ? (
          <p className="text-xs text-gray-500">No photos submitted.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {photos.map((p) => (
              <a key={p.id} href={p.file_url} target="_blank" rel="noreferrer" className="relative block rounded-xl overflow-hidden bg-gray-100 aspect-square hover:opacity-90">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.file_url} alt={p.file_name} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Review actions */}
      {canReview && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Review</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setAction("approve")}
              className={`rounded-xl border p-3 text-left transition-colors ${action === "approve" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Approve
              </p>
              <p className="text-xs text-gray-500 mt-1">Partner earns payout on operator acceptance.</p>
            </button>
            <button
              type="button"
              onClick={() => setAction("request_changes")}
              className={`rounded-xl border p-3 text-left transition-colors ${action === "request_changes" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Request Changes
              </p>
              <p className="text-xs text-gray-500 mt-1">Partner can update photos, DM info, etc.</p>
            </button>
            <button
              type="button"
              onClick={() => setAction("reject")}
              className={`rounded-xl border p-3 text-left transition-colors ${action === "reject" ? "border-red-500 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Reject
              </p>
              <p className="text-xs text-gray-500 mt-1">Submission is closed. Partner may submit another.</p>
            </button>
          </div>

          {action && (
            <>
              <label className="block text-xs font-medium text-gray-600 mb-1">Note {action !== "approve" && "(shown to partner)"}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={action === "approve" ? "Optional internal note…" : "Tell the partner what needs to change or why this was rejected."}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none resize-none mb-3"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setAction(null); setNote(""); }}
                  className="rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitReview}
                  disabled={saving}
                  className="rounded-lg bg-green-primary hover:bg-green-hover px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Submitting…" : `Confirm ${action.replace(/_/g, " ")}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Activity */}
      {activity.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity</h3>
          <ol className="space-y-3">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-gray-300 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-700">{a.description}</p>
                  <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
