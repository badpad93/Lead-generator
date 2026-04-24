"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, Plus, Users, Briefcase, ChevronRight, CheckCircle2, Clock, AlertTriangle, UserX } from "lucide-react";

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_type: string;
  status: string;
  interview_date: string | null;
  created_at: string;
  onboarding_pipelines: { id: string; name: string } | null;
  onboarding_steps: { id: string; name: string; step_key: string } | null;
}

interface Pipeline {
  id: string;
  name: string;
  role_type: string;
  onboarding_steps: { id: string; name: string; step_key: string; order_index: number }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  interview: { label: "Interview", color: "bg-blue-50 text-blue-700" },
  pending_admin_review_1: { label: "Pending Review", color: "bg-amber-50 text-amber-700" },
  welcome_docs_sent: { label: "Welcome Docs", color: "bg-purple-50 text-purple-700" },
  pending_admin_review_2: { label: "Pending Review", color: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", color: "bg-green-50 text-green-700" },
  assigned_to_training: { label: "Training", color: "bg-emerald-50 text-emerald-700" },
  terminated: { label: "Terminated", color: "bg-red-50 text-red-600" },
};

export default function OnboardingPipelinePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPipeline, setSelectedPipeline] = useState<string>("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", role_type: "BDP" });
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/sales"); return; }
      setToken(session.access_token);
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((users: { id: string; role: string }[]) => {
          const me = users.find((u) => u.id === session.user.id);
          if (!me || (me.role !== "admin" && me.role !== "director_of_sales")) {
            router.push("/sales");
          } else {
            setAuthorized(true);
          }
        });
    });
  }, [router]);

  const loadPipelines = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/onboarding/ob-pipelines", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setPipelines(data);
      if (data.length > 0 && !selectedPipeline) setSelectedPipeline(data[0].id);
    }
  }, [token, selectedPipeline]);

  const loadCandidates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const url = selectedPipeline
      ? `/api/onboarding/candidates?pipeline_id=${selectedPipeline}`
      : "/api/onboarding/candidates";
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setCandidates(await res.json());
    setLoading(false);
  }, [token, selectedPipeline]);

  useEffect(() => { loadPipelines(); }, [loadPipelines]);
  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const currentPipeline = pipelines.find((p) => p.id === selectedPipeline);

  async function handleCreate() {
    if (!form.full_name) return;
    setSaving(true);
    await fetch("/api/onboarding/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setForm({ full_name: "", email: "", phone: "", role_type: currentPipeline?.role_type || "BDP" });
    setShowAdd(false);
    setSaving(false);
    loadCandidates();
  }

  const statusIcon = (status: string) => {
    if (status === "completed" || status === "assigned_to_training") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    if (status.includes("pending")) return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    if (status === "terminated") return <UserX className="h-3.5 w-3.5 text-red-500" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />;
  };

  const groupedByStep: Record<string, Candidate[]> = {};
  const hiringSteps = ["interview", "pending_review_1"];
  const onboardingSteps = ["welcome_docs", "pending_review_2", "completed"];
  const stepKeys = [...hiringSteps, ...onboardingSteps, "terminated"];
  const stepLabels: Record<string, string> = {
    interview: "Interview",
    pending_review_1: "Admin Review",
    welcome_docs: "Welcome Docs",
    pending_review_2: "Admin Review",
    completed: "Completed / Training",
    terminated: "Terminated",
  };

  for (const key of stepKeys) groupedByStep[key] = [];

  for (const c of candidates) {
    if (c.status === "interview") groupedByStep["interview"].push(c);
    else if (c.status === "pending_admin_review_1") groupedByStep["pending_review_1"].push(c);
    else if (c.status === "welcome_docs_sent") groupedByStep["welcome_docs"].push(c);
    else if (c.status === "pending_admin_review_2") groupedByStep["pending_review_2"].push(c);
    else if (c.status === "completed" || c.status === "assigned_to_training") groupedByStep["completed"].push(c);
    else if (c.status === "terminated") groupedByStep["terminated"].push(c);
  }

  if (!authorized) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/sales/pipelines" className="text-xs text-gray-400 hover:text-gray-600">Pipelines</Link>
          <h1 className="text-2xl font-bold text-gray-900">Hiring & Onboarding Pipeline</h1>
        </div>
        <button
          onClick={() => { setShowAdd(true); setForm((f) => ({ ...f, role_type: currentPipeline?.role_type || "BDP" })); }}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> New Candidate
        </button>
      </div>

      {/* Pipeline selector */}
      <div className="flex gap-2 mb-6">
        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPipeline(p.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
              selectedPipeline === p.id
                ? "bg-green-600 text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p.role_type === "BDP" ? <Briefcase className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            {p.name}
          </button>
        ))}
      </div>

      {/* Add candidate form */}
      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Candidate</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Full Name *" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <select value={form.role_type} onChange={(e) => setForm((f) => ({ ...f, role_type: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              <option value="BDP">Business Development Partner</option>
              <option value="MARKET_LEADER">Market Leader</option>
            </select>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">{saving ? "Creating..." : "Create"}</button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Pipeline progress steps */}
      {currentPipeline && (
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
          <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 uppercase mr-1 flex-shrink-0">Hiring</span>
          {currentPipeline.onboarding_steps.map((step, i) => {
            const isOnboardingStart = step.step_key === "welcome_docs";
            return (
              <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
                {isOnboardingStart && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold text-green-700 uppercase mx-1">Onboarding</span>
                )}
                {i > 0 && !isOnboardingStart && <ChevronRight className="h-4 w-4 text-gray-300" />}
                <div className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  isOnboardingStart || step.step_key === "completion" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                }`}>
                  {step.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* HIRING PHASE */}
          <div className="flex gap-4 flex-shrink-0">
            <div className="flex flex-col gap-2">
              <div className="rounded-lg bg-blue-50 px-3 py-1.5 text-center">
                <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Hiring</span>
              </div>
              <div className="flex gap-4">
                {hiringSteps.map((key) => {
                  const items = groupedByStep[key];
                  return (
                    <div key={key} className="min-w-[260px] flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase">{stepLabels[key]}</h3>
                        <span className="text-xs text-gray-300">{items.length}</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((c) => (
                          <Link key={c.id} href={`/sales/team/${c.id}`} className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-blue-200 transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                              {statusIcon(c.status)}
                              <p className="text-sm font-medium text-gray-900">{c.full_name}</p>
                            </div>
                            {c.email && <p className="text-xs text-gray-400 mb-1">{c.email}</p>}
                            <div className="flex items-center justify-between">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[c.status]?.color || "bg-gray-100 text-gray-500"}`}>
                                {STATUS_CONFIG[c.status]?.label || c.status}
                              </span>
                              {c.interview_date && <span className="text-xs text-gray-400">{c.interview_date}</span>}
                            </div>
                          </Link>
                        ))}
                        {items.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Empty</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Phase divider */}
          <div className="flex flex-col items-center justify-center flex-shrink-0 px-1">
            <div className="w-px flex-1 bg-gray-200" />
            <ChevronRight className="h-5 w-5 text-gray-300 my-2" />
            <div className="w-px flex-1 bg-gray-200" />
          </div>

          {/* ONBOARDING PHASE */}
          <div className="flex gap-4 flex-shrink-0">
            <div className="flex flex-col gap-2">
              <div className="rounded-lg bg-green-50 px-3 py-1.5 text-center">
                <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Onboarding</span>
              </div>
              <div className="flex gap-4">
                {onboardingSteps.map((key) => {
                  const items = groupedByStep[key];
                  return (
                    <div key={key} className="min-w-[260px] flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase">{stepLabels[key]}</h3>
                        <span className="text-xs text-gray-300">{items.length}</span>
                      </div>
                      <div className="space-y-2">
                        {items.map((c) => (
                          <Link key={c.id} href={`/sales/team/${c.id}`} className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-green-200 transition-colors">
                            <div className="flex items-center gap-2 mb-1">
                              {statusIcon(c.status)}
                              <p className="text-sm font-medium text-gray-900">{c.full_name}</p>
                            </div>
                            {c.email && <p className="text-xs text-gray-400 mb-1">{c.email}</p>}
                            <div className="flex items-center justify-between">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[c.status]?.color || "bg-gray-100 text-gray-500"}`}>
                                {STATUS_CONFIG[c.status]?.label || c.status}
                              </span>
                              {c.interview_date && <span className="text-xs text-gray-400">{c.interview_date}</span>}
                            </div>
                          </Link>
                        ))}
                        {items.length === 0 && <p className="text-xs text-gray-300 text-center py-4">Empty</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TERMINATED */}
          {groupedByStep["terminated"].length > 0 && (
            <>
              <div className="flex flex-col items-center justify-center flex-shrink-0 px-1">
                <div className="w-px flex-1 bg-gray-200" />
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                <div className="rounded-lg bg-red-50 px-3 py-1.5 text-center">
                  <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Terminated</span>
                </div>
                <div className="min-w-[260px]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase">Terminated</h3>
                    <span className="text-xs text-gray-300">{groupedByStep["terminated"].length}</span>
                  </div>
                  <div className="space-y-2">
                    {groupedByStep["terminated"].map((c) => (
                      <Link key={c.id} href={`/sales/team/${c.id}`} className="block rounded-lg border border-red-100 bg-white p-3 hover:border-red-200 transition-colors">
                        <div className="flex items-center gap-2 mb-1">
                          {statusIcon(c.status)}
                          <p className="text-sm font-medium text-gray-900">{c.full_name}</p>
                        </div>
                        {c.email && <p className="text-xs text-gray-400 mb-1">{c.email}</p>}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[c.status]?.color || "bg-gray-100 text-gray-500"}`}>
                          {STATUS_CONFIG[c.status]?.label || c.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
