"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2, Plus, Pencil, Trash2, X, ChevronLeft, ChevronUp,
  ChevronDown, GripVertical, ShieldCheck, Layers, ChevronLeft as Back,
} from "lucide-react";

interface Stage {
  id?: string;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  stage_type: "quantity" | "status" | "date" | "approval" | "document" | "milestone";
  required_for_completion: boolean;
  customer_visible: boolean;
  default_customer_message?: string | null;
  description?: string | null;
}
interface Template {
  id: string;
  workflow_type: string;
  version: number;
  title: string;
  description: string | null;
  default_deadline_days: number | null;
  quantity_based: boolean;
  completion_rule: "all_required_stages_completed" | "quantity_reached_on_final_stages" | "terminal_status" | "never_auto_completes";
  active: boolean;
  workload_weight: number;
  is_custom: boolean;
  category: string | null;
  requires_payment: boolean;
  stages: Stage[];
}

const DEFAULT_CATEGORIES = [
  "Perpetual",
  "Account Management",
  "Sales Ops",
  "Operator Coaching",
  "Other",
];

export default function AdminWorkflowTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    const res = await fetch("/api/admin/workflow-templates", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const data = await res.json();
      setTemplates(data.templates ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token);
        load(session.access_token);
      }
    });
  }, [load]);

  async function handleDelete(t: Template) {
    if (!token) return;
    if (!window.confirm(`Delete "${t.title}"?\n\nThis cannot be undone. If live workflows use this template, the delete will be refused.`)) return;
    const res = await fetch(`/api/admin/workflow-templates/${t.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) load(token);
    else window.alert(`Delete failed: ${(await res.json()).error ?? "unknown"}`);
  }

  const grouped = templates.reduce((acc, t) => {
    const key = t.is_custom ? (t.category ?? "Uncategorized") : "Built-in (system)";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {} as Record<string, Template[]>);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <Link href="/sales/workflows" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <Back className="h-4 w-4" /> Back to Workflows
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Workflow Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Built-in templates are protected. Custom templates carry a
            workload weight — instances add that many points to the assignee&apos;s total.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500"><Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, list]) => (
            <div key={category}>
              <h2 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">{category}</h2>
              <div className="space-y-2">
                {list.map((t) => (
                  <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{t.title}</span>
                        {!t.is_custom && (
                          <span className="inline-flex items-center gap-1 rounded bg-gray-100 text-gray-600 px-1.5 py-0.5 text-[10px] font-medium uppercase">
                            <ShieldCheck className="h-3 w-3" /> System
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium">
                          Weight {t.workload_weight}
                        </span>
                        {!t.active && (
                          <span className="inline-flex items-center rounded bg-gray-100 text-gray-500 px-1.5 py-0.5 text-[10px] uppercase">Inactive</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {t.workflow_type} · {t.stages.length} stage{t.stages.length !== 1 ? "s" : ""} · rule: {t.completion_rule.replace(/_/g, " ")}
                      </div>
                      {t.description && <div className="text-xs text-gray-600 mt-1">{t.description}</div>}
                    </div>
                    {t.is_custom && (
                      <>
                        <button type="button" onClick={() => setEditing(t)} className="text-emerald-700 hover:bg-emerald-50 p-1.5 rounded" title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => handleDelete(t)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl">
              <Layers className="mx-auto h-8 w-8 mb-2" />
              No templates yet. Click <b>New Template</b> to create one.
            </div>
          )}
        </div>
      )}

      {(creating || editing) && token && (
        <TemplateEditorModal
          token={token}
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(token); }}
        />
      )}
    </div>
  );
}

function TemplateEditorModal({
  token,
  template,
  onClose,
  onSaved,
}: {
  token: string;
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [workflowType, setWorkflowType] = useState(template?.workflow_type.replace(/^custom:/, "") ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category, setCategory] = useState(template?.category ?? DEFAULT_CATEGORIES[0]);
  const [weight, setWeight] = useState(template?.workload_weight ?? 1);
  const [defaultDeadlineDays, setDefaultDeadlineDays] = useState<number | "">(template?.default_deadline_days ?? "");
  const [quantityBased, setQuantityBased] = useState(template?.quantity_based ?? false);
  const [completionRule, setCompletionRule] = useState<Template["completion_rule"]>(
    template?.completion_rule ?? "never_auto_completes",
  );
  const [active, setActive] = useState(template?.active ?? true);
  const [requiresPayment, setRequiresPayment] = useState(template?.requires_payment ?? true);
  const [stages, setStages] = useState<Stage[]>(
    template?.stages ?? [
      { stage_key: "started", stage_name: "Started", stage_order: 10, stage_type: "milestone", required_for_completion: false, customer_visible: true },
    ],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All four mutators use functional setState — otherwise the closure
  // over `stages` at render time can drop updates when the admin types
  // in a stage-name input and clicks Add Stage / reorder / delete
  // faster than React can re-render. The visible symptom was every
  // stage getting saved as the default "New Stage" placeholder because
  // the previous keystroke's update never reached committed state.
  function moveStage(i: number, dir: -1 | 1) {
    setStages((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy.map((s, idx) => ({ ...s, stage_order: (idx + 1) * 10 }));
    });
  }

  function updateStage(i: number, patch: Partial<Stage>) {
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      {
        stage_key: `stage_${prev.length + 1}`,
        stage_name: "New Stage",
        stage_order: (prev.length + 1) * 10,
        stage_type: "milestone",
        required_for_completion: false,
        customer_visible: true,
      },
    ]);
  }

  function removeStage(i: number) {
    setStages((prev) =>
      prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stage_order: (idx + 1) * 10 })),
    );
  }

  async function save() {
    setError(null);
    if (!title.trim()) { setError("Title is required"); return; }
    if (!template && !workflowType.trim()) { setError("Workflow type key is required"); return; }
    if (stages.length === 0) { setError("At least one stage is required"); return; }

    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      workflow_type: workflowType.trim() || undefined,
      category: category?.trim() || null,
      workload_weight: weight,
      default_deadline_days: defaultDeadlineDays === "" ? null : Number(defaultDeadlineDays),
      quantity_based: quantityBased,
      completion_rule: completionRule,
      active,
      requires_payment: requiresPayment,
      stages: stages.map((s, idx) => ({
        stage_key: s.stage_key.trim(),
        stage_name: s.stage_name.trim(),
        stage_order: (idx + 1) * 10,
        stage_type: s.stage_type,
        required_for_completion: s.required_for_completion,
        customer_visible: s.customer_visible,
        default_customer_message: s.default_customer_message ?? null,
        description: s.description ?? null,
      })),
    };
    const res = await fetch(
      template ? `/api/admin/workflow-templates/${template.id}` : "/api/admin/workflow-templates",
      {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      },
    );
    if (res.ok) onSaved();
    else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{template ? "Edit template" : "New template"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title" value={title} onChange={setTitle} />
            <Field
              label="Workflow type key"
              value={workflowType}
              onChange={setWorkflowType}
              hint="Auto-prefixed with custom:"
              disabled={!!template}
            />
          </div>

          <FieldTextarea label="Description" value={description} onChange={setDescription} />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Category</label>
              <input
                type="text"
                list="cat-list"
                value={category ?? ""}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
              <datalist id="cat-list">
                {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Workload weight (1-20)</label>
              <input
                type="number"
                min={1}
                max={20}
                value={weight}
                onChange={(e) => setWeight(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Default deadline (days)</label>
              <input
                type="number"
                min={0}
                value={defaultDeadlineDays}
                onChange={(e) => setDefaultDeadlineDays(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="none"
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Completion rule</label>
              <select
                value={completionRule}
                onChange={(e) => setCompletionRule(e.target.value as Template["completion_rule"])}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="never_auto_completes">Never auto-completes (perpetual)</option>
                <option value="all_required_stages_completed">All required stages completed</option>
                <option value="quantity_reached_on_final_stages">Quantity reached on final stages</option>
                <option value="terminal_status">Terminal status</option>
              </select>
            </div>
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={quantityBased} onChange={(e) => setQuantityBased(e.target.checked)} />
                Quantity-based (stages track counts vs targets)
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active (available for new workflows)
              </label>
              <label className="inline-flex items-center gap-2" title="Turn off for perpetual/coaching work with no invoice — the Payment tile is hidden on the workflow page.">
                <input type="checkbox" checked={requiresPayment} onChange={(e) => setRequiresPayment(e.target.checked)} />
                Requires payment (shows the Payment tile on workflows)
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-wide text-gray-500">Stages</label>
              <button type="button" onClick={addStage} className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add stage
              </button>
            </div>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
              {stages.map((s, i) => (
                <div key={i} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-gray-300" />
                    <span className="text-xs text-gray-400 w-6">#{i + 1}</span>
                    <input
                      type="text"
                      value={s.stage_name}
                      onChange={(e) => updateStage(i, { stage_name: e.target.value })}
                      placeholder="Stage name"
                      className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm"
                    />
                    <input
                      type="text"
                      value={s.stage_key}
                      onChange={(e) => updateStage(i, { stage_key: e.target.value })}
                      placeholder="stage_key"
                      className="w-32 rounded-md border border-gray-200 px-2 py-1 text-xs font-mono"
                    />
                    <select
                      value={s.stage_type}
                      onChange={(e) => updateStage(i, { stage_type: e.target.value as Stage["stage_type"] })}
                      className="rounded-md border border-gray-200 px-2 py-1 text-xs"
                    >
                      <option value="milestone">milestone</option>
                      <option value="status">status</option>
                      <option value="quantity">quantity</option>
                      <option value="date">date</option>
                      <option value="approval">approval</option>
                      <option value="document">document</option>
                    </select>
                    <button type="button" onClick={() => moveStage(i, -1)} disabled={i === 0} className="text-gray-500 hover:text-gray-800 disabled:opacity-30 p-1"><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1} className="text-gray-500 hover:text-gray-800 disabled:opacity-30 p-1"><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeStage(i)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center gap-4 text-xs pl-8">
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={s.required_for_completion} onChange={(e) => updateStage(i, { required_for_completion: e.target.checked })} />
                      Required for completion
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={s.customer_visible} onChange={(e) => updateStage(i, { customer_visible: e.target.checked })} />
                      Customer-visible
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800 px-3 py-2">Cancel</button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4 rotate-90" />}
              {template ? "Save changes" : "Create template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint, disabled }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
      />
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}
function FieldTextarea({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</label>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
