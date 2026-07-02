"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Bell, Filter, ArrowLeft, CheckCircle2, XCircle, Clock, Ban } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Notification {
  id: string;
  recipient_profile_id: string | null;
  recipient_email: string;
  event_type: string;
  channel: string;
  dedup_key: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  contract_id: string | null;
  submission_id: string | null;
  payout_id: string | null;
  sent_at: string;
}

const EVENT_FILTERS = [
  { key: "all", label: "All events" },
  { key: "partner_contract_opened", label: "Contract opened" },
  { key: "admin_submission_created", label: "Submission created" },
  { key: "operator_submission_ready", label: "Operator ready" },
  { key: "partner_submission_reviewed", label: "Submission reviewed" },
  { key: "partner_operator_decided", label: "Operator decision" },
  { key: "partner_payout_sent", label: "Payout sent" },
];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "skipped_preference", label: "Skipped (pref)" },
  { key: "skipped_rate_limit", label: "Skipped (rate)" },
];

const STATUS_MAP: Record<string, { color: string; icon: typeof Clock }> = {
  sent: { color: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  failed: { color: "bg-red-50 text-red-700", icon: XCircle },
  skipped_preference: { color: "bg-gray-100 text-gray-600", icon: Ban },
  skipped_rate_limit: { color: "bg-amber-50 text-amber-700", icon: Clock },
  skipped_no_channel: { color: "bg-gray-100 text-gray-600", icon: Ban },
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [eventType, setEventType] = useState("all");
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (eventType !== "all") params.set("event_type", eventType);
    if (status !== "all") params.set("status", status);
    const res = await fetch(`/api/admin/marketplace/notifications?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setNotifications(await res.json());
    setLoading(false);
  }, [token, eventType, status]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/notifications"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="h-6 w-6 text-green-primary" /> Notification Log
        </h1>
        <p className="text-sm text-gray-500 mt-1">Every marketplace email we&apos;ve sent — successes, skips, and failures.</p>
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-green-primary focus:outline-none"
        >
          {EVENT_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${status === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Bell className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">Nothing here</p>
          <p className="text-sm text-gray-500">Try a different filter.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Event</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Recipient</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Subject</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Sent</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((n) => {
                const s = STATUS_MAP[n.status] || STATUS_MAP.sent;
                const Icon = s.icon;
                return (
                  <tr key={n.id} className="border-t border-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                      {n.event_type}
                      <span className={`ml-1.5 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${n.channel === "sms" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        {n.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{n.recipient_email}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-sm truncate" title={n.subject || ""}>{n.subject || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${s.color}`}>
                        <Icon className="h-3 w-3" />
                        {n.status.replace(/_/g, " ")}
                      </span>
                      {n.error && <p className="text-[10px] text-red-500 mt-1 max-w-xs truncate" title={n.error}>{n.error}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(n.sent_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
