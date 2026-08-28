"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Globe, MessageSquare, Send, CheckCircle2, AlertCircle, Download, ExternalLink } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface DetailRequest {
  id: string;
  status: string;
  business_name: string | null;
  primary_contact: string | null;
  phone: string | null;
  email: string | null;
  business_address: string | null;
  years_in_business: string | null;
  business_story: string | null;
  mission_values: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  preferred_style: string | null;
  tagline: string | null;
  primary_services: string[] | null;
  industries_served: string[] | null;
  geographic_market: Record<string, unknown> | null;
  homepage_message: string | null;
  about_content: string | null;
  services_content: string | null;
  primary_cta: string | null;
  primary_cta_custom: string | null;
  inquiry_email: string | null;
  public_phone: string | null;
  business_hours: string | null;
  domain_status: string | null;
  current_domain: string | null;
  domain_registrar: string | null;
  business_email: string | null;
  existing_website: string | null;
  integrations: Array<{ key: string; notes?: string }> | null;
  requested_features: Array<{ key: string; notes?: string }> | null;
  launch_checklist: Record<string, boolean> | null;
  legal_pages_needed: string[] | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  user: { id: string; full_name: string | null; email: string | null; role: string; company_name: string | null } | null;
  assignee: { id: string; full_name: string | null; email: string | null } | null;
}

interface Media {
  id: string;
  kind: string;
  file_name: string | null;
  external_url: string | null;
  caption: string | null;
  mime_type: string | null;
  signed_url: string | null;
  created_at: string;
}

interface Activity {
  id: string;
  event_type: string;
  visibility: "public" | "internal";
  previous_status: string | null;
  new_status: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; full_name: string | null; email: string | null } | null;
}

const STATUSES = [
  "submitted", "under_review", "needs_information",
  "approved_for_build", "in_development", "client_review",
  "ready_to_launch", "launched", "cancelled",
];

export default function AdminWebsiteRequestDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<DetailRequest | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [infoRequestText, setInfoRequestText] = useState("");

  const load = useCallback(async (t: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/website-requests/${id}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const body = await res.json();
      setRequest(body.request);
      setMedia(body.media || []);
      setActivity(body.activity || []);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push(`/login?redirect=/admin/website-requests/${id}`); return; }
      setToken(session.access_token);
      load(session.access_token);
    });
  }, [router, id, load]);

  async function changeStatus(nextStatus: string) {
    setError(null); setMessage(null); setSaving("status");
    const res = await fetch(`/api/admin/website-requests/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: nextStatus }),
    });
    setSaving(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Status update failed");
      return;
    }
    setMessage(`Status updated to ${nextStatus.replace(/_/g, " ")}`);
    await load(token);
  }

  async function addNote(visibility: "internal" | "public") {
    if (!noteText.trim()) return;
    setError(null); setMessage(null); setSaving("note");
    const res = await fetch(`/api/admin/website-requests/${id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: noteText, visibility }),
    });
    setSaving(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Note failed");
      return;
    }
    setNoteText("");
    setMessage(visibility === "internal" ? "Internal note added" : "Public note added");
    await load(token);
  }

  async function requestInfo() {
    if (!infoRequestText.trim()) return;
    setError(null); setMessage(null); setSaving("info");
    const res = await fetch(`/api/admin/website-requests/${id}/request-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: infoRequestText }),
    });
    setSaving(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Request-info failed");
      return;
    }
    setInfoRequestText("");
    setMessage("Needs-info request sent to customer");
    await load(token);
  }

  if (loading || !request) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/admin/website-requests" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> All Requests
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <Globe className="h-5 w-5 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{request.business_name || "Untitled Request"}</h1>
            <p className="text-sm text-gray-500">
              {request.user?.full_name || "—"} &lt;{request.user?.email}&gt; · updated {new Date(request.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-xs font-semibold">
          {request.status.replace(/_/g, " ")}
        </span>
      </div>

      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 mt-0.5" /> {message}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — intake summary */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Business">
            <Row label="Contact" v={request.primary_contact} />
            <Row label="Email" v={request.email} />
            <Row label="Phone" v={request.phone} />
            <Row label="Address" v={request.business_address} />
            <Row label="Years" v={request.years_in_business} />
            <Block label="Story" v={request.business_story} />
            <Block label="Mission" v={request.mission_values} />
          </Card>
          <Card title="Brand">
            <Row label="Style" v={request.preferred_style} />
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 w-40 shrink-0">Colors</span>
              <div className="flex items-center gap-2">
                {request.brand_primary_color && (
                  <span className="inline-flex items-center gap-1"><span className="w-5 h-5 rounded border border-gray-200" style={{ background: request.brand_primary_color }} />{request.brand_primary_color}</span>
                )}
                {request.brand_secondary_color && (
                  <span className="inline-flex items-center gap-1"><span className="w-5 h-5 rounded border border-gray-200" style={{ background: request.brand_secondary_color }} />{request.brand_secondary_color}</span>
                )}
              </div>
            </div>
            <Row label="Tagline" v={request.tagline} />
          </Card>
          <Card title="Products & Customer">
            <Row label="Services" v={(request.primary_services || []).join(", ")} />
            <Row label="Industries" v={(request.industries_served || []).join(", ")} />
            <Row label="Geo (JSON)" v={JSON.stringify(request.geographic_market || {})} />
          </Card>
          <Card title="Content">
            <Block label="Hero" v={request.homepage_message} />
            <Block label="About" v={request.about_content} />
            <Block label="Services" v={request.services_content} />
            <Row label="Primary CTA" v={request.primary_cta === "custom" ? request.primary_cta_custom : request.primary_cta} />
          </Card>
          <Card title="Contact">
            <Row label="Public Email" v={request.inquiry_email} />
            <Row label="Public Phone" v={request.public_phone} />
            <Row label="Hours" v={request.business_hours} />
          </Card>
          <Card title="Domain & Tech">
            <Row label="Owns Domain" v={request.domain_status} />
            <Row label="Domain" v={request.current_domain} />
            <Row label="Registrar" v={request.domain_registrar} />
            <Row label="Business Email" v={request.business_email} />
            <Row label="Existing Site" v={request.existing_website} />
            <Row label="Integrations" v={(request.integrations || []).map((i) => i.key).join(", ")} />
          </Card>
          <Card title="Features">
            <Row label="Requested" v={(request.requested_features || []).map((f) => f.key).join(", ")} />
          </Card>
          <Card title="Launch Checklist">
            <ul className="text-sm text-gray-700">
              {Object.entries(request.launch_checklist || {}).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  <CheckCircle2 className={`h-3.5 w-3.5 ${v ? "text-emerald-600" : "text-gray-300"}`} />
                  <span>{k.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
            {(request.legal_pages_needed || []).length > 0 && (
              <p className="text-xs text-gray-500 mt-2">Legal: {(request.legal_pages_needed || []).join(", ")}</p>
            )}
          </Card>
          <Card title={`Media (${media.length})`}>
            {media.length === 0 ? (
              <p className="text-sm text-gray-500">No uploads.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {media.map((m) => (
                  <div key={m.id} className="rounded-lg border border-gray-100 overflow-hidden bg-white">
                    {m.kind === "video_link" ? (
                      <a href={m.external_url || "#"} target="_blank" rel="noreferrer" className="block p-3 text-xs text-green-primary hover:underline break-all">
                        <ExternalLink className="inline h-3 w-3 mr-1" /> {m.external_url}
                      </a>
                    ) : m.signed_url ? (
                      <a href={m.signed_url} target="_blank" rel="noreferrer" className="block group">
                        {m.mime_type?.startsWith("video/") ? (
                          <div className="aspect-square flex items-center justify-center bg-gray-50 text-xs text-gray-500">Video</div>
                        ) : (
                          <img src={m.signed_url} alt={m.file_name || ""} className="aspect-square w-full object-cover" />
                        )}
                        <div className="p-1 text-[10px] text-gray-500 truncate flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          <span className="uppercase text-[9px]">{m.kind}</span>
                          <span className="truncate">{m.file_name}</span>
                        </div>
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column — controls + activity */}
        <div className="space-y-4">
          <Card title="Status">
            <select
              value={request.status}
              onChange={(e) => changeStatus(e.target.value)}
              disabled={saving === "status"}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </Card>

          <Card title="Request more information">
            <p className="text-xs text-gray-500 mb-2">Sends a public message + flips status to Needs Information.</p>
            <textarea
              value={infoRequestText}
              onChange={(e) => setInfoRequestText(e.target.value)}
              rows={3}
              placeholder="What do you need from them?"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              onClick={requestInfo}
              disabled={saving === "info" || !infoRequestText.trim()}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving === "info" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send Needs-Info Request
            </button>
          </Card>

          <Card title="Notes">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="Note for the team or the customer"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => addNote("internal")}
                disabled={saving === "note" || !noteText.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Internal
              </button>
              <button
                onClick={() => addNote("public")}
                disabled={saving === "note" || !noteText.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Public
              </button>
            </div>
          </Card>

          <Card title="Activity">
            <ol className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold ${a.visibility === "internal" ? "text-gray-700" : "text-blue-700"}`}>
                      {a.event_type.replace(/_/g, " ")}
                      {a.visibility === "internal" && <span className="ml-1 text-[9px] text-gray-400 uppercase">Internal</span>}
                    </span>
                    <span className="text-gray-400">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  {a.message && <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{a.message}</p>}
                  {a.actor && <p className="text-gray-400 mt-0.5">{a.actor.full_name || a.actor.email}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, v }: { label: string; v: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-40 text-gray-500 shrink-0">{label}</span>
      <span className="flex-1 text-gray-900 break-words">{v || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

function Block({ label, v }: { label: string; v: string | null | undefined }) {
  return (
    <div className="text-sm">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-gray-900 whitespace-pre-wrap">{v || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}
