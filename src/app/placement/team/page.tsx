"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Users, UserPlus, ArrowLeft, Mail, X, AlertCircle, Crown, Shield, User, MailPlus } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Member {
  id: string;
  role: string;
  active: boolean;
  joined_at: string | null;
  invited_at: string | null;
  profile: { full_name: string; email: string } | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

interface TeamData {
  company: { id: string; business_name: string } | null;
  role: "owner" | "manager" | "agent";
  members: Member[];
  invites: Invite[];
}

const ROLE_ICONS: Record<string, typeof Crown> = {
  owner: Crown,
  manager: Shield,
  agent: User,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-600 bg-amber-50",
  manager: "text-blue-600 bg-blue-50",
  agent: "text-gray-600 bg-gray-100",
};

export default function PlacementTeamPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeamData | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "agent">("agent");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/marketplace/team", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/placement/team"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function sendInvite() {
    setError(null);
    setSaving("invite");
    const res = await fetch("/api/marketplace/team", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else {
      setMessage(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setShowInvite(false);
      await load();
    }
    setSaving(null);
  }

  async function changeRole(memberId: string, role: "manager" | "agent") {
    setSaving(`role-${memberId}`);
    setError(null);
    const res = await fetch(`/api/marketplace/team/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else await load();
    setSaving(null);
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remove this member? They'll lose access immediately.")) return;
    setSaving(`remove-${memberId}`);
    setError(null);
    const res = await fetch(`/api/marketplace/team/members/${memberId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else await load();
    setSaving(null);
  }

  async function revokeInvite(inviteId: string) {
    setSaving(`revoke-${inviteId}`);
    setError(null);
    const res = await fetch(`/api/marketplace/team/invites/${inviteId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) await load();
    else setError("Failed to revoke");
    setSaving(null);
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const canManage = data.role === "owner" || data.role === "manager";
  const isOwner = data.role === "owner";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/placement" className="text-sm text-gray-500 hover:text-green-primary flex items-center gap-1.5 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-green-primary" /> Team
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.company?.business_name ? `Team members at ${data.company.business_name}.` : "Manage your team."}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
          >
            <UserPlus className="h-4 w-4" /> Invite Member
          </button>
        )}
      </div>

      {message && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Members */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-900">Members ({data.members.filter((m) => m.active).length})</h2>
        </div>
        <ul>
          {data.members.filter((m) => m.active).map((m) => {
            const Icon = ROLE_ICONS[m.role] || User;
            return (
              <li key={m.id} className="px-5 py-4 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${ROLE_COLORS[m.role] || "bg-gray-100 text-gray-600"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{m.profile?.full_name || m.profile?.email || "—"}</p>
                    <p className="text-xs text-gray-500 truncate">{m.profile?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[m.role]}`}>
                    {m.role}
                  </span>
                  {isOwner && m.role !== "owner" && (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value as "manager" | "agent")}
                      disabled={saving === `role-${m.id}`}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-green-primary focus:outline-none"
                    >
                      <option value="agent">Agent</option>
                      <option value="manager">Manager</option>
                    </select>
                  )}
                  {canManage && m.role !== "owner" && (
                    <button
                      onClick={() => removeMember(m.id)}
                      disabled={saving === `remove-${m.id}`}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer disabled:opacity-50"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Pending invites */}
      {data.invites.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-semibold text-gray-900">Pending Invites ({data.invites.length})</h2>
          </div>
          <ul>
            {data.invites.map((i) => (
              <li key={i.id} className="px-5 py-3 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <MailPlus className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{i.email}</p>
                    <p className="text-xs text-gray-500 capitalize">
                      {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => revokeInvite(i.id)}
                    disabled={saving === `revoke-${i.id}`}
                    className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Mail className="h-5 w-5 text-green-primary" /> Invite Team Member
            </h2>
            <p className="text-xs text-gray-500 mb-4">They&apos;ll get an email with a link to join.</p>

            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none mb-4"
            />

            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(isOwner ? (["agent", "manager"] as const) : (["agent"] as const)).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  className={`rounded-xl border p-3 text-left transition-colors ${inviteRole === r ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <p className="text-sm font-semibold text-gray-900 capitalize">{r}</p>
                  <p className="text-xs text-gray-500">
                    {r === "agent" ? "Submits locations. Sees own submissions." : "Invites agents. Sees all company submissions."}
                  </p>
                </button>
              ))}
            </div>

            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowInvite(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={sendInvite}
                disabled={saving === "invite" || !inviteEmail.trim()}
                className="rounded-lg bg-green-primary hover:bg-green-hover px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {saving === "invite" ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
