"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, ChevronRight, Upload, CheckCircle2, Circle, AlertTriangle, FileText, Lock, Building2, Search, X, Link2, Unlink } from "lucide-react";

interface StepDoc {
  id: string;
  name: string;
  file_type: string | null;
  required: boolean;
}

interface Step {
  id: string;
  name: string;
  order_index: number;
  requires_document: boolean;
  step_documents: StepDoc[];
}

interface ItemDoc {
  id: string;
  step_document_id: string;
  file_url: string;
  file_name: string | null;
  completed: boolean;
  step_documents: StepDoc | null;
}

interface Account {
  id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  entity_type: string | null;
}

interface PipelineItem {
  id: string;
  name: string;
  status: string;
  value: number;
  notes: string | null;
  current_step_id: string | null;
  pipeline_id: string;
  account_id: string | null;
  pipeline_steps: { id: string; name: string; order_index: number } | null;
  sales_accounts: Account | null;
  employees: { full_name: string; email: string | null } | null;
  pipeline_item_documents: ItemDoc[];
  all_steps: Step[];
  created_at: string;
}

export default function PipelineItemDetailPage() {
  const { id: pipelineId, itemId } = useParams<{ id: string; itemId: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [item, setItem] = useState<PipelineItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [missingDocs, setMissingDocs] = useState<{ id: string; name: string }[]>([]);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [showAccountSearch, setShowAccountSearch] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const res = await fetch("/api/sales/accounts", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) setAccounts(await res.json());
    });
  }, []);

  const load = useCallback(async () => {
    if (!token || !itemId) return;
    setLoading(true);
    const res = await fetch(`/api/pipeline-items/${itemId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setItem(await res.json());
    setLoading(false);
  }, [token, itemId]);

  useEffect(() => { load(); }, [load]);

  async function handleMove(direction: "next" | "back") {
    setMoving(true);
    setMoveError(null);
    setMissingDocs([]);
    const res = await fetch(`/api/pipeline-items/${itemId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) {
      load();
    } else {
      const data = await res.json();
      setMoveError(data.error);
      if (data.missing_documents) setMissingDocs(data.missing_documents);
    }
    setMoving(false);
  }

  async function handleMarkStatus(status: "won" | "lost") {
    await fetch(`/api/pipeline-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handleUploadDoc(stepDocId: string, file: File) {
    setUploadingDocId(stepDocId);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("step_document_id", stepDocId);
    await fetch(`/api/pipeline-items/${itemId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    setUploadingDocId(null);
    setMissingDocs([]);
    setMoveError(null);
    load();
  }

  async function handleLinkAccount(accountId: string) {
    setLinkingAccount(true);
    await fetch(`/api/pipeline-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ account_id: accountId }),
    });
    setShowAccountSearch(false);
    setAccountSearch("");
    setShowAccountDropdown(false);
    setLinkingAccount(false);
    load();
  }

  async function handleUnlinkAccount() {
    if (!confirm("Unlink this account from the pipeline item?")) return;
    await fetch(`/api/pipeline-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ account_id: null }),
    });
    load();
  }

  const filteredAccounts = accountSearch.length > 0
    ? accounts.filter((a) =>
        a.business_name.toLowerCase().includes(accountSearch.toLowerCase()) ||
        (a.contact_name || "").toLowerCase().includes(accountSearch.toLowerCase()) ||
        (a.email || "").toLowerCase().includes(accountSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;
  if (!item) return <p className="p-6 text-gray-400">Item not found.</p>;

  const currentStepIdx = item.all_steps.findIndex((s) => s.id === item.current_step_id);
  const currentStep = currentStepIdx >= 0 ? item.all_steps[currentStepIdx] : null;
  const isFirst = currentStepIdx === 0;
  const isLast = currentStepIdx === item.all_steps.length - 1;
  const isCompleted = item.status === "won" || item.status === "lost";

  // Check which docs are completed for current step
  const uploadedDocIds = new Set(
    item.pipeline_item_documents.filter((d) => d.completed).map((d) => d.step_document_id)
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button onClick={() => router.push(`/sales/pipelines/${pipelineId}/items`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back to Pipeline
      </button>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-gray-900">{item.name}</h1>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            item.status === "won" ? "bg-green-50 text-green-700" :
            item.status === "lost" ? "bg-red-50 text-red-600" :
            "bg-blue-50 text-blue-600"
          }`}>{item.status}</span>
        </div>
        <div className="flex gap-6 text-sm text-gray-500">
          {item.employees && <span>Employee: {item.employees.full_name}</span>}
          {item.value > 0 && <span className="text-green-600 font-medium">${Number(item.value).toLocaleString()}</span>}
        </div>
      </div>

      {/* Linked Account */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-400" />
            Operator Account
          </h2>
          {item.sales_accounts ? (
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowAccountSearch(true); }} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 cursor-pointer">
                <Link2 className="h-3 w-3" /> Change
              </button>
              <button onClick={handleUnlinkAccount} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 cursor-pointer">
                <Unlink className="h-3 w-3" /> Unlink
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAccountSearch(!showAccountSearch)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">
              <Link2 className="h-3 w-3" /> Link Account
            </button>
          )}
        </div>

        {showAccountSearch && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={accountSearch}
              onChange={(e) => { setAccountSearch(e.target.value); setShowAccountDropdown(true); }}
              onFocus={() => { if (accountSearch) setShowAccountDropdown(true); }}
              placeholder="Search accounts by name, contact, or email..."
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-9 text-sm focus:border-green-500 focus:outline-none"
              autoFocus
            />
            {accountSearch && (
              <button onClick={() => { setAccountSearch(""); setShowAccountSearch(false); setShowAccountDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
            {showAccountDropdown && filteredAccounts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                {filteredAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleLinkAccount(a.id)}
                    disabled={linkingAccount}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 cursor-pointer disabled:opacity-50"
                  >
                    <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{a.business_name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[a.contact_name, a.email, a.phone].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showAccountDropdown && accountSearch.length > 0 && filteredAccounts.length === 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-sm text-gray-400 text-center">
                No accounts found
              </div>
            )}
          </div>
        )}

        {item.sales_accounts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-gray-400">Business Name</p>
              <p className="text-sm font-medium text-gray-900">{item.sales_accounts.business_name}</p>
            </div>
            {item.sales_accounts.contact_name && (
              <div>
                <p className="text-xs text-gray-400">Contact Name</p>
                <p className="text-sm text-gray-700">{item.sales_accounts.contact_name}</p>
              </div>
            )}
            {item.sales_accounts.email && (
              <div>
                <p className="text-xs text-gray-400">Email</p>
                <p className="text-sm text-gray-700">{item.sales_accounts.email}</p>
              </div>
            )}
            {item.sales_accounts.phone && (
              <div>
                <p className="text-xs text-gray-400">Phone</p>
                <p className="text-sm text-gray-700">{item.sales_accounts.phone}</p>
              </div>
            )}
            {item.sales_accounts.address && (
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-400">Address</p>
                <p className="text-sm text-gray-700">{item.sales_accounts.address}</p>
              </div>
            )}
            {item.sales_accounts.entity_type && (
              <div>
                <p className="text-xs text-gray-400">Entity Type</p>
                <p className="text-sm text-gray-700">{item.sales_accounts.entity_type}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No account linked. Link an account to auto-populate operator info.</p>
        )}
      </div>

      {/* Step Progress */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Pipeline Progress</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {item.all_steps.map((step, i) => {
            const isCurrent = step.id === item.current_step_id;
            const isPast = i < currentStepIdx;
            return (
              <div key={step.id} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <div className={`h-0.5 w-6 ${isPast || isCurrent ? "bg-green-400" : "bg-gray-200"}`} />}
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                  isCurrent ? "bg-green-600 text-white" :
                  isPast ? "bg-green-100 text-green-700" :
                  "bg-gray-100 text-gray-400"
                }`}>
                  {isPast ? <CheckCircle2 className="h-3 w-3" /> : isCurrent ? <Circle className="h-3 w-3 fill-white" /> : <Circle className="h-3 w-3" />}
                  {step.name}
                  {step.requires_document && <Lock className="h-3 w-3 opacity-50" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Step Documents */}
      {currentStep && currentStep.requires_document && currentStep.step_documents.length > 0 && !isCompleted && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Required Documents — {currentStep.name}
          </h2>
          <div className="space-y-3">
            {currentStep.step_documents.map((doc) => {
              const isUploaded = uploadedDocIds.has(doc.id);
              const uploadedDoc = item.pipeline_item_documents.find((d) => d.step_document_id === doc.id && d.completed);
              const isUploading = uploadingDocId === doc.id;

              return (
                <div key={doc.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  isUploaded ? "border-green-200 bg-green-50" : "border-gray-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {isUploaded ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <FileText className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm text-gray-900">{doc.name}</span>
                    {doc.required && !isUploaded && <span className="text-xs text-red-400">Required</span>}
                    {isUploaded && uploadedDoc?.file_name && (
                      <span className="text-xs text-green-600">{uploadedDoc.file_name}</span>
                    )}
                  </div>
                  {!isUploaded ? (
                    <label className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer">
                      {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      {isUploading ? "Uploading..." : "Upload"}
                      <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUploadDoc(doc.id, e.target.files[0]); }} />
                    </label>
                  ) : (
                    <span className="text-xs text-green-600 font-medium">Completed</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Move error */}
      {moveError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <span>{moveError}</span>
          </div>
          {missingDocs.length > 0 && (
            <ul className="mt-2 ml-6 list-disc text-xs text-amber-700">
              {missingDocs.map((d) => <li key={d.id}>{d.name}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      {!isCompleted && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleMove("back")}
            disabled={isFirst || moving}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            Previous Step
          </button>
          <button
            onClick={() => handleMove("next")}
            disabled={moving}
            className="flex items-center gap-1 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            {isLast ? "Complete" : "Next Step"}
          </button>
          <div className="ml-auto flex gap-2">
            <button onClick={() => handleMarkStatus("won")} className="rounded-lg border border-green-200 px-3 py-2 text-xs font-medium text-green-600 hover:bg-green-50 cursor-pointer">Mark Won</button>
            <button onClick={() => handleMarkStatus("lost")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 cursor-pointer">Mark Lost</button>
          </div>
        </div>
      )}
    </div>
  );
}
