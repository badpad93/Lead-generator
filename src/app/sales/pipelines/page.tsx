"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { GitBranch, Plus, Loader2, Settings, ChevronRight, Users, Briefcase } from "lucide-react";

interface Pipeline {
  id: string;
  name: string;
  type: string;
  pipeline_steps: { id: string; name: string; order_index: number }[];
  created_at: string;
}

export default function PipelinesPage() {
  const [token, setToken] = useState("");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "sales" });
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
        fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then((r) => r.ok ? r.json() : [])
          .then((users: { id: string; role: string }[]) => {
            const me = users.find((u) => u.id === session.user.id);
            if (me) setUserRole(me.role);
          });
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/pipelines", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setPipelines(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = userRole === "admin" || userRole === "director_of_sales";

  async function handleCreate() {
    if (!form.name) return;
    setSaving(true);
    await fetch("/api/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setForm({ name: "", type: "sales" });
    setShowAdd(false);
    setSaving(false);
    load();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <GitBranch className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Pipelines</h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> New Pipeline
          </button>
        )}
      </div>

      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Create Pipeline</h3>
          <div className="flex gap-3">
            <input
              placeholder="Pipeline name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
            >
              <option value="sales">Sales</option>
              <option value="hiring">Hiring</option>
            </select>
            <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
              {saving ? "Creating..." : "Create"}
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pipelines.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-green-200 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {p.type === "hiring" ? <Users className="h-4 w-4 text-blue-500" /> : <Briefcase className="h-4 w-4 text-green-600" />}
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.type === "hiring" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
                  {p.type}
                </span>
              </div>

              <div className="flex flex-wrap gap-1 mb-4">
                {p.pipeline_steps.map((step, i) => (
                  <span key={step.id} className="flex items-center gap-0.5 text-xs text-gray-500">
                    {i > 0 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                    {step.name}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/sales/pipelines/${p.id}/items`}
                  className="flex-1 text-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  View Items
                </Link>
                {isAdmin && (
                  <Link
                    href={`/sales/pipelines/${p.id}/edit`}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Settings className="h-3 w-3" /> Edit
                  </Link>
                )}
              </div>
            </div>
          ))}
          {pipelines.length === 0 && (
            <p className="col-span-2 text-center text-gray-400 py-12">No pipelines yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
