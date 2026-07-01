"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Upload, CheckCircle2, XCircle, Clock, AlertCircle, MapPin, User, Phone, Mail, Zap, Car, MessageSquare } from "lucide-react";
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
  operator_status: string;
  admin_review_note: string | null;
  created_at: string;
  placement_contracts: {
    title: string;
    tier: number;
    partner_payout: number;
    machine_type: string | null;
  } | null;
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

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending Admin Review", color: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approved by Admin", color: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  changes_requested: { label: "Changes Requested", color: "bg-blue-50 text-blue-700", icon: AlertCircle },
  rejected: { label: "Rejected", color: "bg-red-50 text-red-700", icon: XCircle },
};

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/marketplace/submissions/${id}`, {
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
      if (!session?.access_token) { router.push(`/login?redirect=/placement/submissions/${id}`); return; }
      setToken(session.access_token);
    });
  }, [router, id]);

  useEffect(() => { load(); }, [load]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/marketplace/submissions/${id}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (res.ok) await load();
    setUploading(false);
  }

  if (loading || !submission) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const status = STATUS_MAP[submission.admin_status] || STATUS_MAP.pending;
  const StatusIcon = status.icon;
  const canEdit = submission.admin_status !== "approved" && submission.admin_status !== "rejected";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/placement/submissions" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Submissions
      </Link>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{submission.business_name}</h1>
          {submission.placement_contracts && (
            <p className="text-sm text-gray-500 mt-1">
              Submitted for <span className="font-medium">{submission.placement_contracts.title}</span> · Tier {submission.placement_contracts.tier}
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${status.color}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </span>
      </div>

      {submission.admin_status === "changes_requested" && submission.admin_review_note && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 mb-4">
          <p className="text-sm font-semibold text-blue-900 mb-1 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Admin Requested Changes
          </p>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">{submission.admin_review_note}</p>
        </div>
      )}

      {submission.admin_status === "rejected" && submission.admin_review_note && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-4">
          <p className="text-sm font-semibold text-red-900 mb-1 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Rejected
          </p>
          <p className="text-sm text-red-800 whitespace-pre-wrap">{submission.admin_review_note}</p>
        </div>
      )}

      {/* Address */}
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
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.notes}</p>
        </div>
      )}

      {/* Photos */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Site Photos ({photos.length})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p) => (
            <a key={p.id} href={p.file_url} target="_blank" rel="noreferrer" className="relative block rounded-xl overflow-hidden bg-gray-100 aspect-square hover:opacity-90">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.file_url} alt={p.file_name} className="w-full h-full object-cover" />
            </a>
          ))}
          {canEdit && (
            <label className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-green-primary transition-colors aspect-square ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? (
                <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-[10px] text-gray-500">Add photo</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.currentTarget.value = ""; }}
              />
            </label>
          )}
        </div>
      </div>

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
