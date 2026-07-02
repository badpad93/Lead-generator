"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, MapPin, Zap, Car, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Submission {
  id: string;
  contract_id: string;
  business_name: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  employees: number | null;
  traffic_score: number | null;
  power_available: boolean;
  parking_available: boolean;
  machine_recommendation: string | null;
  notes: string | null;
  operator_status: string;
  operator_reviewed_at: string | null;
  operator_review_note: string | null;
  machine_type: string | null;
  market_city: string | null;
  market_state: string | null;
  created_at: string;
}

interface Photo {
  id: string;
  file_url: string;
  file_name: string;
  caption: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending Your Review", color: "bg-amber-50 text-amber-700", icon: Clock },
  accepted: { label: "Accepted", color: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-50 text-red-700", icon: XCircle },
};

export default function OperatorSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [action, setAction] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/operator/marketplace/submissions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setSubmission(data.submission);
      setPhotos(data.photos);
    }
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push(`/login?redirect=/operator/marketplace/${id}`); return; }
      setToken(session.access_token);
    });
  }, [router, id]);

  useEffect(() => { load(); }, [load]);

  async function decide() {
    if (!action) return;
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/operator/marketplace/submissions/${id}/decide`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Failed");
    } else {
      setAction(null);
      setNote("");
      await load();
    }
    setSaving(false);
  }

  if (loading || !submission) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const status = STATUS_MAP[submission.operator_status] || STATUS_MAP.pending;
  const StatusIcon = status.icon;
  const canDecide = submission.operator_status === "pending";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/operator/marketplace" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Marketplace
      </Link>

      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{submission.business_name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sourced by our placement network · {new Date(submission.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${status.color}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </span>
      </div>

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
            <p className="text-gray-500">Employees / Daily Traffic</p>
            <p className="font-medium text-gray-900">{submission.employees ?? "—"}</p>
          </div>
          <div>
            <p className="text-gray-500">Traffic Score</p>
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
        {submission.machine_recommendation && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Recommended Machine</p>
            <p className="text-sm text-gray-700">{submission.machine_recommendation}</p>
          </div>
        )}
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Site Photos ({photos.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p) => (
              <a key={p.id} href={p.file_url} target="_blank" rel="noreferrer" className="relative block rounded-xl overflow-hidden bg-gray-100 aspect-square hover:opacity-90">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.file_url} alt={p.file_name} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {submission.notes && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Site Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.notes}</p>
        </div>
      )}

      {/* Prior decision */}
      {!canDecide && submission.operator_review_note && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <p className="text-xs text-gray-500 mb-1">Your review note</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.operator_review_note}</p>
          {submission.operator_reviewed_at && (
            <p className="text-xs text-gray-400 mt-1">{new Date(submission.operator_reviewed_at).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Decide */}
      {canDecide && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Decision</h3>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setAction("accept")}
              className={`rounded-xl border p-3 text-left transition-colors ${action === "accept" ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Accept Location
              </p>
              <p className="text-xs text-gray-500 mt-1">Locks a slot on your contract. Placement fee will be invoiced.</p>
            </button>
            <button
              type="button"
              onClick={() => setAction("reject")}
              className={`rounded-xl border p-3 text-left transition-colors ${action === "reject" ? "border-red-500 bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Reject
              </p>
              <p className="text-xs text-gray-500 mt-1">Pass on this site. Partner may submit another location.</p>
            </button>
          </div>

          {action && (
            <>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Note {action === "reject" ? "(shared with our team)" : "(optional)"}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={action === "accept" ? "Any special install instructions or notes for our team…" : "Why is this site not a fit? Helps us guide the partner to better sites."}
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
                  onClick={decide}
                  disabled={saving}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50 ${action === "accept" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
                >
                  {saving ? "Submitting…" : action === "accept" ? "Confirm Accept" : "Confirm Reject"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
