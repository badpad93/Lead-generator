"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Users, Loader2, Search, CheckCircle2, Clock, UserX, AlertTriangle, Plus, X, Eye, EyeOff, UserPlus, Trash2, Send, FileSignature, ClipboardCheck } from "lucide-react";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_type: string;
  status: string;
  created_at: string;
  onboarding_pipelines: { name: string } | null;
  onboarding_steps: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  interview: { label: "Interview", color: "bg-blue-50 text-blue-700" },
  pending_admin_review_1: { label: "Pending Review", color: "bg-amber-50 text-amber-700" },
  interview_complete: { label: "Ready for Welcome Email", color: "bg-amber-50 text-amber-700" },
  welcome_docs_sent: { label: "Welcome Docs", color: "bg-purple-50 text-purple-700" },
  pending_admin_review_2: { label: "Pending Review", color: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", color: "bg-green-50 text-green-700" },
  assigned_to_training: { label: "Training", color: "bg-emerald-50 text-emerald-700" },
  terminated: { label: "Terminated", color: "bg-red-50 text-red-600" },
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "interview", label: "Interviewing" },
  { value: "pending_admin_review_1", label: "Pending Review 1" },
  { value: "interview_complete", label: "Ready for Welcome Email" },
  { value: "welcome_docs_sent", label: "Welcome Docs" },
  { value: "pending_admin_review_2", label: "Pending Review 2" },
  { value: "completed", label: "Completed" },
  { value: "assigned_to_training", label: "Training" },
  { value: "terminated", label: "Terminated" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  sales: "Sales Rep",
  sales_manager: "Sales Manager",
  director_of_sales: "Director of Sales",
  market_leader: "Market Leader",
};

export default function TeamPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: "", email: "", role: "sales", password: "" });
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [tab, setTab] = useState<"active" | "onboarding">("active");
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const loadTeamMembers = useCallback(async (t: string) => {
    const res = await fetch("/api/sales/users", { headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) setTeamMembers(await res.json());
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/sales"); return; }
      setToken(session.access_token);
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((users: TeamMember[]) => {
          const me = users.find((u) => u.id === session.user.id);
          if (!me || (me.role !== "admin" && me.role !== "director_of_sales" && me.role !== "market_leader" && me.role !== "sales_manager")) {
            router.push("/sales");
          } else {
            setAuthorized(true);
            setTeamMembers(users);
            setCurrentUserId(session.user.id);
            setCurrentUserRole(me.role);
          }
        });
    });
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/onboarding/candidates${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setCandidates(await res.json());
    setLoading(false);
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Latest onboarding status per team member, refreshed on tab
  // focus + after a Send action. Keyed by member id + lowercase
  // email so the status pill lights up whether the invite carried
  // team_member_id or was created email-only.
  const loadOnboardingStatuses = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/admin/contractor-onboarding", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const rows = (data.onboardings ?? []) as Array<{
        id: string;
        team_member_id: string | null;
        contractor_email: string;
        status: string;
        completed_at: string | null;
        sent_at: string | null;
      }>;
      // Newest first per API contract; walk once and keep the first
      // (i.e. latest) row per key.
      const next: typeof onboardingByKey = {};
      for (const r of rows) {
        const record = { id: r.id, status: r.status, completed_at: r.completed_at, sent_at: r.sent_at };
        if (r.team_member_id && !next[r.team_member_id]) next[r.team_member_id] = record;
        const emailKey = `email:${r.contractor_email.toLowerCase()}`;
        if (!next[emailKey]) next[emailKey] = record;
      }
      setOnboardingByKey(next);
    } catch {
      // Non-fatal — Team page still renders without the status column.
    }
  }, [token]);

  useEffect(() => { void loadOnboardingStatuses(); }, [loadOnboardingStatuses]);

  async function handleAddMember() {
    if (!addForm.full_name || !addForm.email || !addForm.password) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addForm.email.trim())) {
      setAddError("Please enter a valid email address");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    setAddSuccess(null);
    try {
      const res = await fetch("/api/sales/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        const newUser = await res.json();
        setAddSuccess(`Account created for ${newUser.full_name} (${newUser.email})`);
        setAddForm({ full_name: "", email: "", role: "sales", password: "" });
        loadTeamMembers(token);
      } else {
        const err = await res.json().catch(() => ({}));
        setAddError(err.error || "Failed to create account");
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAddSaving(false);
    }
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Latest contractor onboarding record per team member — keyed by
  // both team_member_id and (lowercase) email so we can match no
  // matter which was stamped at invite time. Fed by
  // /api/admin/contractor-onboarding on mount.
  const [onboardingByKey, setOnboardingByKey] = useState<Record<string, {
    id: string;
    status: string;
    completed_at: string | null;
    sent_at: string | null;
  }>>({});

  // Contractor onboarding modal state — a distinct flow from the
  // candidate pipeline. Sends the VP contractor packet to a signed
  // team member post-hire. Prefills email + name from the row when
  // the admin clicks "Onboard Contractor" on a specific member.
  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardForm, setOnboardForm] = useState({
    contractor_name: "",
    email: "",
    start_date: "",
    team_member_id: null as string | null,
  });
  const [onboardSaving, setOnboardSaving] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);
  const [onboardSuccess, setOnboardSuccess] = useState<string | null>(null);

  function openOnboardForMember(m: TeamMember | null) {
    setOnboardError(null);
    setOnboardSuccess(null);
    setOnboardForm({
      contractor_name: m?.full_name ?? "",
      email: m?.email ?? "",
      start_date: "",
      team_member_id: m?.id ?? null,
    });
    setShowOnboard(true);
  }

  async function handleSendOnboardingPacket() {
    setOnboardError(null);
    setOnboardSuccess(null);
    setOnboardSaving(true);
    try {
      const res = await fetch("/api/admin/contractor-onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(onboardForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setOnboardError(data.error ?? `Failed (HTTP ${res.status})`);
      } else {
        setOnboardSuccess(
          `Onboarding packet sent to ${onboardForm.email}. Link expires ${new Date(data.expires_at).toLocaleDateString()}.`,
        );
        void loadOnboardingStatuses();
        setTimeout(() => setShowOnboard(false), 2200);
      }
    } catch (err) {
      setOnboardError(err instanceof Error ? err.message : "Network error");
    }
    setOnboardSaving(false);
  }

  async function handleDelete(userId: string, userName: string, userEmail: string) {
    if (!window.confirm(
      `Delete ${userName || userEmail}?\n\nThis removes their sales account, unassigns them from every workflow/lead/order (records stay), and cannot be undone.`,
    )) return;
    setDeletingId(userId);
    try {
      const res = await fetch(`/api/sales/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTeamMembers((prev) => prev.filter((m) => m.id !== userId));
      } else {
        const err = await res.json().catch(() => ({}));
        window.alert(`Delete failed: ${err.error ?? "Unknown error"}`);
      }
    } catch (e) {
      window.alert(`Delete failed: ${e instanceof Error ? e.message : "Network error"}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setRoleUpdating(userId);
    setRoleError(null);
    const prevMembers = teamMembers;
    setTeamMembers((prev) => prev.map((m) => m.id === userId ? { ...m, role: newRole } : m));
    try {
      const res = await fetch("/api/sales/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: userId, role: newRole }),
      });
      if (res.ok) {
        await loadTeamMembers(token);
      } else {
        const err = await res.json().catch(() => ({}));
        setRoleError(err.error || "Failed to update role");
        setTeamMembers(prevMembers);
      }
    } catch {
      setRoleError("Network error");
      setTeamMembers(prevMembers);
    } finally {
      setRoleUpdating(null);
    }
  }

  if (!authorized) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  const filtered = candidates.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusIcon = (status: string) => {
    if (status === "completed" || status === "assigned_to_training") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    if (status.includes("pending")) return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    if (status === "terminated") return <UserX className="h-3.5 w-3.5 text-red-500" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />;
  };

  const filteredTeam = teamMembers.filter((m) =>
    m.full_name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <span className="text-sm text-gray-400 ml-2">
            {tab === "active" ? `${teamMembers.length} active` : `${candidates.length} onboarding`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openOnboardForMember(null)}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
            title="Send a contractor onboarding packet"
          >
            <FileSignature className="h-4 w-4" /> Onboard
          </button>
          <Link
            href="/sales/onboarding-packets"
            className="flex items-center gap-1.5 rounded-lg border border-green-600 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
            title="View every contractor onboarding packet in one place"
          >
            <ClipboardCheck className="h-4 w-4" /> Onboarding Packets
          </Link>
          <button
            onClick={() => { setShowAddMember(true); setAddError(null); setAddSuccess(null); }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" /> Add Team Member
          </button>
          <Link
            href="/sales/pipelines/onboarding"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View Onboarding Pipeline
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${tab === "active" ? "border-green-600 text-green-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Active Members
        </button>
        <button
          onClick={() => setTab("onboarding")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${tab === "onboarding" ? "border-green-600 text-green-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Onboarding
        </button>
      </div>

      <div className="flex gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[260px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-11 pr-4 py-2.5 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
        {tab === "onboarding" && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
          >
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        )}
      </div>

      {roleError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 flex items-center justify-between">
          {roleError}
          <button onClick={() => setRoleError(null)} className="text-red-400 hover:text-red-600 cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Active Members Tab */}
      {tab === "active" && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Onboarding</th>
                {currentUserRole === "admin" && (
                  <th className="text-right px-4 py-3 font-medium text-gray-500 w-20">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTeam.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{m.full_name}</td>
                  <td className="px-4 py-3 text-gray-500">{m.email}</td>
                  <td className="px-4 py-3">
                    {currentUserRole === "admin" && m.id !== currentUserId ? (
                      <div className="relative inline-flex items-center">
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          disabled={roleUpdating === m.id}
                          className="rounded-full bg-green-50 pl-2.5 pr-7 py-0.5 text-xs font-medium text-green-700 border-none focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer appearance-none disabled:opacity-50"
                        >
                          <option value="sales">Sales Rep</option>
                          <option value="market_leader">Market Leader</option>
                          <option value="director_of_sales">Director of Sales</option>
                          <option value="admin">Admin</option>
                        </select>
                        {roleUpdating === m.id && <Loader2 className="h-3 w-3 animate-spin text-green-600 ml-1 absolute right-1" />}
                      </div>
                    ) : (
                      <span className="inline-flex rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                        {ROLE_LABELS[m.role] || m.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OnboardingCell
                      member={m}
                      record={
                        onboardingByKey[m.id] ??
                        onboardingByKey[`email:${m.email.toLowerCase()}`] ??
                        null
                      }
                    />
                  </td>
                  {currentUserRole === "admin" && (
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openOnboardForMember(m)}
                          className="inline-flex items-center gap-1 rounded-md p-1.5 text-gray-300 hover:bg-green-50 hover:text-green-600 transition-colors"
                          title={`Send contractor onboarding packet to ${m.full_name || m.email}`}
                          aria-label={`Onboard ${m.full_name || m.email}`}
                        >
                          <FileSignature className="h-4 w-4" />
                        </button>
                        {m.id !== currentUserId && (
                          <button
                            type="button"
                            onClick={() => handleDelete(m.id, m.full_name, m.email)}
                            disabled={deletingId === m.id}
                            className="inline-flex items-center gap-1 rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                            title={`Delete ${m.full_name || m.email}`}
                            aria-label={`Delete ${m.full_name || m.email}`}
                          >
                            {deletingId === m.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredTeam.length === 0 && (
                <tr><td colSpan={currentUserRole === "admin" ? 5 : 4} className="px-4 py-8 text-center text-gray-400">No team members found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Onboarding Tab */}
      {tab === "onboarding" && (
        loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Current Step</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <Link href={`/sales/team/${c.id}`} className="font-medium text-gray-900 hover:text-green-600">
                        {c.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.role_type === "BDP" ? "Business Dev Partner" : "Market Leader"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{c.onboarding_steps?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[c.status]?.color || "bg-gray-100 text-gray-500"}`}>
                        {statusIcon(c.status)}
                        {STATUS_CONFIG[c.status]?.label || c.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No onboarding candidates found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Add Team Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-green-600" />
                Add Team Member
              </h2>
              <button onClick={() => setShowAddMember(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
                <input
                  value={addForm.full_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="e.g. Zach Seymour"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="e.g. zach@company.com"
                  type="email"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
                >
                  <option value="sales">Sales Rep</option>
                  <option value="market_leader">Market Leader</option>
                  <option value="director_of_sales">Director of Sales</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Temporary Password</label>
                <div className="relative">
                  <input
                    value={addForm.password}
                    onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 characters"
                    type={showPassword ? "text" : "password"}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 pr-10 text-sm focus:border-green-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">Share these credentials with the team member so they can log in.</p>
            </div>

            {addError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{addError}</div>
            )}
            {addSuccess && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{addSuccess}</div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleAddMember}
                disabled={addSaving || !addForm.full_name || !addForm.email || !addForm.password || addForm.password.length < 8}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {addSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {addSaving ? "Creating..." : "Create Account"}
              </button>
              <button
                onClick={() => setShowAddMember(false)}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contractor Onboarding Modal — separate from Add Team Member.
          Sends the signed VP contractor legal packet to a hired
          contractor via a secure hashed-token link. */}
      {showOnboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-green-600" />
                Start Contractor Onboarding
              </h2>
              <button
                onClick={() => setShowOnboard(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Send the Vending Connector / Apex AI Vending Vice President contractor packet.
              The contractor receives a secure link to complete their information, agreements, tax
              form, and payment setup — no login required.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Contractor Name <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  value={onboardForm.contractor_name}
                  onChange={(e) => setOnboardForm((f) => ({ ...f, contractor_name: e.target.value }))}
                  placeholder="e.g. Zach Seymour"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  value={onboardForm.email}
                  onChange={(e) => setOnboardForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="contractor@example.com"
                  type="email"
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  value={onboardForm.start_date}
                  onChange={(e) => setOnboardForm((f) => ({ ...f, start_date: e.target.value }))}
                  type="date"
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
            </div>

            {onboardError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                {onboardError}
              </div>
            )}
            {onboardSuccess && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                {onboardSuccess}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleSendOnboardingPacket}
                disabled={
                  onboardSaving ||
                  !onboardForm.email ||
                  !onboardForm.start_date ||
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(onboardForm.email)
                }
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {onboardSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {onboardSaving ? "Sending..." : "Send Onboarding Packet"}
              </button>
              <button
                onClick={() => setShowOnboard(false)}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OnboardingCell — pill + click-through per team member row.
// Colors mirror the admin detail page's StatusPill so admins get
// a consistent visual vocabulary across the two surfaces.
// ─────────────────────────────────────────────────────────────
function OnboardingCell({
  member,
  record,
}: {
  member: TeamMember;
  record: { id: string; status: string; completed_at: string | null; sent_at: string | null } | null;
}) {
  if (!record) {
    return <span className="text-xs text-gray-400">Not started</span>;
  }
  const map: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-700",
    sent: "bg-blue-50 text-blue-700",
    opened: "bg-yellow-50 text-yellow-700",
    in_progress: "bg-orange-50 text-orange-700",
    completed: "bg-green-50 text-green-700",
    needs_attention: "bg-red-50 text-red-700",
    revoked: "bg-gray-100 text-gray-500 line-through",
    expired: "bg-gray-100 text-gray-500",
  };
  const label = {
    not_started: "Not Started",
    sent: "Sent",
    opened: "Opened",
    in_progress: "In Progress",
    completed: "Completed",
    needs_attention: "Needs Attention",
    revoked: "Revoked",
    expired: "Expired",
  }[record.status] ?? record.status;
  const dateStr =
    record.completed_at
      ? ` ${new Date(record.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : "";
  return (
    <Link
      href={`/sales/team/contractor-onboarding/${record.id}`}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80 transition-opacity ${map[record.status] ?? map.not_started}`}
      title={`View onboarding for ${member.full_name || member.email}`}
    >
      {label}
      {dateStr}
    </Link>
  );
}
