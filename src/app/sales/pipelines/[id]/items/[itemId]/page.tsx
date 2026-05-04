"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Loader2, ChevronRight, Upload, CheckCircle2, Circle, AlertTriangle, FileText, Lock, Building2, Search, X, Link2, Unlink, Send, DollarSign, ShieldCheck, PenTool, CreditCard, Clock, ExternalLink, MapPin, Calculator, Plus, ClipboardList, RefreshCw } from "lucide-react";

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
  requires_signature: boolean;
  requires_payment: boolean;
  requires_admin_approval: boolean;
  requires_order: boolean;
  payment_amount: number | null;
  payment_description: string | null;
  pandadoc_preliminary_template_id: string | null;
  pandadoc_full_template_id: string | null;
  payment_provider: string;
  step_documents: StepDoc[];
}

interface EsignDoc {
  id: string;
  pipeline_item_id: string;
  step_id: string;
  document_name: string;
  recipient_email: string;
  recipient_name: string | null;
  status: string;
  signed_pdf_url: string | null;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Payment {
  id: string;
  pipeline_item_id: string;
  step_id: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  payment_url: string | null;
  paid_at: string | null;
  created_at: string;
}

interface GatingStatus {
  canAdvance: boolean;
  requirements: {
    order: { required: boolean; completed: boolean };
    documents: { required: boolean; completed: boolean };
    signature: { required: boolean; completed: boolean; pending: boolean };
    payment: { required: boolean; completed: boolean; pending: boolean };
    adminApproval: { required: boolean; completed: boolean };
  };
  blockers: string[];
}

interface Location {
  id: string;
  location_name: string | null;
  address: string | null;
  phone: string | null;
  decision_maker_name: string | null;
  decision_maker_email: string | null;
  industry: string | null;
  zip: string | null;
  employee_count: number | null;
  traffic_count: number | null;
  machine_type: string | null;
  business_hours: string | null;
  machines_requested: number | null;
  is_revealed: boolean;
}

interface PricingData {
  total_score: number;
  traffic_score: number;
  hours_score: number;
  machine_score: number;
  tier: number;
  tier_label: string;
  price: number;
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

interface LocationAgreementInfo {
  id: string;
  status: string;
  signature_name: string | null;
  signed_at: string | null;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
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
  location_id: string | null;
  proposal_status: string;
  pipeline_steps: { id: string; name: string; order_index: number } | null;
  sales_accounts: Account | null;
  employees: { full_name: string; email: string | null } | null;
  locations: Location | null;
  pipeline_item_documents: ItemDoc[];
  all_steps: Step[];
  location_agreement: LocationAgreementInfo | null;
  created_at: string;
}

const HOURS_TO_DISPLAY: Record<string, string> = { low: "8", medium: "12", high: "16", "24/7": "24" };
const DISPLAY_TO_HOURS: Record<string, string> = { "8": "low", "12": "medium", "16": "high", "24": "24/7" };

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
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [esignDocs, setEsignDocs] = useState<EsignDoc[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [gating, setGating] = useState<GatingStatus | null>(null);
  const [sendingEsign, setSendingEsign] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [approvingStep, setApprovingStep] = useState(false);
  const [esignForm, setEsignForm] = useState({ document_name: "", recipient_email: "", template_id: "" });
  const [sendingProposal, setSendingProposal] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [resendingAgreement, setResendingAgreement] = useState(false);
  const [resendResult, setResendResult] = useState<string | null>(null);
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [pricingInputs, setPricingInputs] = useState({ employees: 0, foot_traffic: 0, business_hours: "low" as string, machines_requested: 1 });
  const [calculatingPricing, setCalculatingPricing] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderOperatorId, setOrderOperatorId] = useState<string | null>(null);
  const [orderOperatorSearch, setOrderOperatorSearch] = useState("");
  const [orderLocationSearch, setOrderLocationSearch] = useState("");
  const [allLocations, setAllLocations] = useState<Location[]>([]);
  const [orderSelectedLocation, setOrderSelectedLocation] = useState<Location | null>(null);
  const [orderLocationForm, setOrderLocationForm] = useState({
    location_name: "", address: "", phone: "", decision_maker_name: "", decision_maker_email: "",
    industry: "", zip: "", employee_count: "", traffic_count: "", machine_type: "", business_hours: "8", machines_requested: "1",
  });

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      setToken(session.access_token);
      const [acctRes, locRes] = await Promise.all([
        fetch("/api/sales/accounts", { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch("/api/locations", { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      if (acctRes.ok) {
        setAccounts(await acctRes.json());
      }
      if (locRes.ok) {
        setAllLocations(await locRes.json());
      }
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

  const loadGatingData = useCallback(async () => {
    if (!token || !itemId || !item?.current_step_id) return;
    const [gRes, eRes, pRes] = await Promise.all([
      fetch(`/api/pipeline-items/${itemId}/gating-status?step_id=${item.current_step_id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/pipeline-items/${itemId}/esign?step_id=${item.current_step_id}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/pipeline-items/${itemId}/payments?step_id=${item.current_step_id}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (gRes.ok) setGating(await gRes.json());
    if (eRes.ok) setEsignDocs(await eRes.json());
    if (pRes.ok) setPayments(await pRes.json());
  }, [token, itemId, item?.current_step_id]);

  useEffect(() => { loadGatingData(); }, [loadGatingData]);

  async function handleSendEsign() {
    if (!esignForm.document_name || !esignForm.recipient_email) return;
    setSendingEsign(true);
    await fetch(`/api/pipeline-items/${itemId}/esign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        step_id: item?.current_step_id,
        document_name: esignForm.document_name,
        recipient_email: esignForm.recipient_email,
        recipient_name: item?.name || "",
        template_id: esignForm.template_id || undefined,
        send_immediately: true,
      }),
    });
    setEsignForm({ document_name: "", recipient_email: "", template_id: "" });
    setSendingEsign(false);
    loadGatingData();
  }

  async function handleMarkEsignComplete(esignId: string) {
    await fetch(`/api/pipeline-items/${itemId}/esign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ esign_id: esignId, action: "mark_completed" }),
    });
    loadGatingData();
    load();
  }

  async function handleCreatePayment() {
    if (!item?.current_step_id) return;
    setCreatingPayment(true);
    const step = item.all_steps.find((s) => s.id === item.current_step_id);
    await fetch(`/api/pipeline-items/${itemId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        step_id: item.current_step_id,
        amount: step?.payment_amount || 0,
        description: step?.payment_description || `Payment for ${step?.name || "step"}`,
      }),
    });
    setCreatingPayment(false);
    loadGatingData();
  }

  async function handleApproveStep() {
    if (!item?.current_step_id) return;
    setApprovingStep(true);
    await fetch(`/api/pipeline-items/${itemId}/approve-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ step_id: item.current_step_id }),
    });
    setApprovingStep(false);
    loadGatingData();
  }

  function openCreateOrderModal() {
    setOrderError(null);
    setOrderOperatorId(item?.account_id || null);
    setOrderOperatorSearch("");
    setOrderLocationSearch("");
    setOrderSelectedLocation(item?.locations || null);
    const loc = item?.locations;
    const acct = item?.sales_accounts;
    setOrderLocationForm({
      location_name: loc?.location_name || acct?.business_name || "",
      address: loc?.address || acct?.address || "",
      phone: loc?.phone || acct?.phone || "",
      decision_maker_name: loc?.decision_maker_name || acct?.contact_name || "",
      decision_maker_email: loc?.decision_maker_email || acct?.email || "",
      industry: loc?.industry || "",
      zip: loc?.zip || "",
      employee_count: loc?.employee_count != null ? String(loc.employee_count) : "",
      traffic_count: loc?.traffic_count != null ? String(loc.traffic_count) : "",
      machine_type: loc?.machine_type || "",
      business_hours: HOURS_TO_DISPLAY[loc?.business_hours || "low"] || "8",
      machines_requested: loc?.machines_requested != null ? String(loc.machines_requested) : "1",
    });
    setShowCreateOrder(true);
  }

  function handleSelectLocation(loc: Location) {
    setOrderSelectedLocation(loc);
    setOrderLocationForm({
      location_name: loc.location_name || "",
      address: loc.address || "",
      phone: loc.phone || "",
      decision_maker_name: loc.decision_maker_name || "",
      decision_maker_email: loc.decision_maker_email || "",
      industry: loc.industry || "",
      zip: loc.zip || "",
      employee_count: loc.employee_count != null ? String(loc.employee_count) : "",
      traffic_count: loc.traffic_count != null ? String(loc.traffic_count) : "",
      machine_type: loc.machine_type || "",
      business_hours: HOURS_TO_DISPLAY[loc.business_hours || "low"] || "8",
      machines_requested: loc.machines_requested != null ? String(loc.machines_requested) : "1",
    });
    setOrderLocationSearch("");
  }

  async function handleCreateOrder() {
    if (!orderOperatorId) { setOrderError("Select an operator account"); return; }
    if (!orderLocationForm.location_name) { setOrderError("Enter a location name"); return; }
    if (!orderLocationForm.industry) { setOrderError("Industry is required for pricing"); return; }
    if (!orderLocationForm.zip) { setOrderError("ZIP code is required for pricing"); return; }
    if (!orderLocationForm.employee_count) { setOrderError("Employee count is required for pricing"); return; }
    if (!orderLocationForm.traffic_count) { setOrderError("Foot traffic is required for pricing"); return; }
    setOrderSaving(true);
    setOrderError(null);
    try {
      const locRes = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          location_name: orderLocationForm.location_name,
          address: orderLocationForm.address || null,
          phone: orderLocationForm.phone || null,
          decision_maker_name: orderLocationForm.decision_maker_name || null,
          decision_maker_email: orderLocationForm.decision_maker_email || null,
          industry: orderLocationForm.industry || null,
          zip: orderLocationForm.zip || null,
          employee_count: orderLocationForm.employee_count ? Number(orderLocationForm.employee_count) : null,
          traffic_count: orderLocationForm.traffic_count ? Number(orderLocationForm.traffic_count) : null,
          machine_type: orderLocationForm.machine_type || null,
          business_hours: DISPLAY_TO_HOURS[orderLocationForm.business_hours] || orderLocationForm.business_hours || null,
          machines_requested: orderLocationForm.machines_requested ? Number(orderLocationForm.machines_requested) : null,
        }),
      });
      if (!locRes.ok) {
        const err = await locRes.json();
        throw new Error(err.error || "Failed to create location");
      }
      const newLocation = await locRes.json();

      const patchRes = await fetch(`/api/pipeline-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: orderOperatorId, location_id: newLocation.id }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        throw new Error(err.error || "Failed to update pipeline item");
      }

      setShowCreateOrder(false);
      load();
      loadGatingData();
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : "Unknown error");
    }
    setOrderSaving(false);
  }

  const operatorAccounts = accounts.filter((a) => a.entity_type === "operator");

  const filteredOperatorAccounts = orderOperatorSearch.length > 0
    ? operatorAccounts.filter((a) =>
        a.business_name.toLowerCase().includes(orderOperatorSearch.toLowerCase()) ||
        (a.contact_name || "").toLowerCase().includes(orderOperatorSearch.toLowerCase()))
    : operatorAccounts;

  const filteredLocations = orderLocationSearch.length > 0
    ? allLocations.filter((l) =>
        (l.location_name || "").toLowerCase().includes(orderLocationSearch.toLowerCase()) ||
        (l.address || "").toLowerCase().includes(orderLocationSearch.toLowerCase()) ||
        (l.industry || "").toLowerCase().includes(orderLocationSearch.toLowerCase()) ||
        (l.zip || "").toLowerCase().includes(orderLocationSearch.toLowerCase()))
    : allLocations;

  const selectedOperator = accounts.find((a) => a.id === orderOperatorId) || null;

  async function handleSendProposal() {
    if (!item?.current_step_id) return;
    setSendingProposal(true);
    setProposalError(null);
    try {
      const res = await fetch(`/api/pipeline-items/${itemId}/send-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItem((prev) => prev ? { ...prev, proposal_status: "proposal_sent" } : prev);
        load();
        loadGatingData();
        loadLocationPricing();
      } else {
        const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        setProposalError(data.error || `Request failed (${res.status})`);
      }
    } catch (err) {
      setProposalError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSendingProposal(false);
    }
  }

  async function handleResendAgreement() {
    setResendingAgreement(true);
    setResendResult(null);
    try {
      const res = await fetch(`/api/pipeline-items/${itemId}/resend-agreement`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setResendResult(`Agreement resent to ${data.sent_to}`);
      } else {
        setResendResult(`Error: ${data.error}`);
      }
    } catch {
      setResendResult("Network error");
    } finally {
      setResendingAgreement(false);
    }
  }

  const loadLocationPricing = useCallback(async () => {
    if (!token || !item?.location_id) return;
    const res = await fetch(`/api/locations/${item.location_id}/calculate-pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      setPricingData(data);
    }
  }, [token, item?.location_id]);

  useEffect(() => { loadLocationPricing(); }, [loadLocationPricing]);

  useEffect(() => {
    if (item?.locations) {
      const loc = item.locations;
      setPricingInputs({
        employees: loc.employee_count || 0,
        foot_traffic: loc.traffic_count || 0,
        business_hours: loc.business_hours || "low",
        machines_requested: (loc.machines_requested as 1 | 2 | 3 | 4) || 1,
      });
    }
  }, [item?.locations]);

  async function handleRecalculatePricing() {
    if (!item?.location_id) return;
    setCalculatingPricing(true);
    const res = await fetch(`/api/locations/${item.location_id}/calculate-pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(pricingInputs),
    });
    if (res.ok) {
      const data = await res.json();
      setPricingData(data);
    }
    setCalculatingPricing(false);
  }

  const filteredAccounts = accounts.filter((a) =>
    a.entity_type === "operator" &&
    (accountSearch.length === 0 ||
      a.business_name.toLowerCase().includes(accountSearch.toLowerCase()) ||
      (a.contact_name || "").toLowerCase().includes(accountSearch.toLowerCase()) ||
      (a.email || "").toLowerCase().includes(accountSearch.toLowerCase()))
  ).slice(0, 20);

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
          <div className="mb-3">
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search operator accounts..."
                className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-9 text-sm focus:border-green-500 focus:outline-none"
                autoFocus
              />
              {accountSearch && (
                <button onClick={() => { setAccountSearch(""); setShowAccountSearch(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white max-h-48 overflow-y-auto">
              {filteredAccounts.length > 0 ? (
                filteredAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleLinkAccount(a.id)}
                    disabled={linkingAccount}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-pointer disabled:opacity-50"
                  >
                    <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{a.business_name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[a.contact_name, a.email, a.phone].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-3 text-sm text-gray-400 text-center">No operator accounts found</div>
              )}
            </div>
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

      {/* Create Order */}
      {(!item.account_id || !item.location_id) && !isCompleted && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Order not created</p>
                <p className="text-xs text-amber-600">Attach an operator account and location to create the order.</p>
              </div>
            </div>
            <button
              onClick={openCreateOrderModal}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Create Order
            </button>
          </div>
        </div>
      )}

      {/* Location Details */}
      {item.locations && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-gray-400" />
            Location
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {item.locations.location_name && (
              <div>
                <p className="text-xs text-gray-400">Location Name</p>
                <p className="text-sm font-medium text-gray-900">{item.locations.location_name}</p>
              </div>
            )}
            {item.locations.address && (
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-400">Address</p>
                <p className="text-sm text-gray-700">{item.locations.address}</p>
              </div>
            )}
            {item.locations.industry && (
              <div>
                <p className="text-xs text-gray-400">Industry</p>
                <p className="text-sm text-gray-700">{item.locations.industry}</p>
              </div>
            )}
            {item.locations.zip && (
              <div>
                <p className="text-xs text-gray-400">ZIP</p>
                <p className="text-sm text-gray-700">{item.locations.zip}</p>
              </div>
            )}
            {item.locations.employee_count != null && (
              <div>
                <p className="text-xs text-gray-400">Employees</p>
                <p className="text-sm text-gray-700">{item.locations.employee_count}</p>
              </div>
            )}
            {item.locations.traffic_count != null && (
              <div>
                <p className="text-xs text-gray-400">Foot Traffic</p>
                <p className="text-sm text-gray-700">{item.locations.traffic_count}</p>
              </div>
            )}
            {item.locations.machine_type && (
              <div>
                <p className="text-xs text-gray-400">Machine Type</p>
                <p className="text-sm text-gray-700">{item.locations.machine_type}</p>
              </div>
            )}
            {item.locations.machines_requested != null && (
              <div>
                <p className="text-xs text-gray-400">Machines Requested</p>
                <p className="text-sm text-gray-700">{item.locations.machines_requested}</p>
              </div>
            )}
            {item.locations.decision_maker_name && (
              <div>
                <p className="text-xs text-gray-400">Decision Maker</p>
                <p className="text-sm text-gray-700">{item.locations.decision_maker_name}</p>
              </div>
            )}
            {item.locations.decision_maker_email && (
              <div>
                <p className="text-xs text-gray-400">DM Email</p>
                <p className="text-sm text-gray-700">{item.locations.decision_maker_email}</p>
              </div>
            )}
            {item.locations.phone && (
              <div>
                <p className="text-xs text-gray-400">Phone</p>
                <p className="text-sm text-gray-700">{item.locations.phone}</p>
              </div>
            )}
            {item.locations.business_hours && (
              <div>
                <p className="text-xs text-gray-400">Business Hours</p>
                <p className="text-sm text-gray-700">{HOURS_TO_DISPLAY[item.locations.business_hours] || item.locations.business_hours} Hours</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Location Agreement Status */}
      {item.location_agreement && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              Location Agreement
            </h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              item.location_agreement.status === "signed" ? "bg-green-100 text-green-700" :
              item.location_agreement.status === "viewed" ? "bg-blue-100 text-blue-600" :
              "bg-yellow-100 text-yellow-700"
            }`}>
              {item.location_agreement.status === "signed" ? "Signed" :
               item.location_agreement.status === "viewed" ? "Viewed" :
               "Pending"}
            </span>
          </div>
          {item.location_agreement.status === "signed" ? (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Signed by {item.location_agreement.signature_name}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-600">
                {item.location_agreement.contact_name && (
                  <div><span className="text-gray-400">Contact:</span> {item.location_agreement.contact_name}</div>
                )}
                {item.location_agreement.email && (
                  <div><span className="text-gray-400">Email:</span> {item.location_agreement.email}</div>
                )}
                {item.location_agreement.phone && (
                  <div><span className="text-gray-400">Phone:</span> {item.location_agreement.phone}</div>
                )}
                {item.location_agreement.signed_at && (
                  <div><span className="text-gray-400">Signed:</span> {new Date(item.location_agreement.signed_at).toLocaleDateString()}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="h-4 w-4 text-gray-400" />
                <span>
                  Agreement sent {new Date(item.location_agreement.created_at).toLocaleDateString()}
                  {item.location_agreement.email && <> to {item.location_agreement.email}</>}
                  {" — waiting for location partner to sign"}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResendAgreement}
                disabled={resendingAgreement}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                {resendingAgreement ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Resend Agreement Email
              </button>
              {resendResult && (
                <p className={`text-xs ${resendResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                  {resendResult}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Send Location Agreement (when none exists yet) */}
      {!item.location_agreement && item.location_id && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-yellow-600" />
                Location Agreement Not Sent
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                No agreement has been sent to the location manager yet.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResendAgreement}
              disabled={resendingAgreement}
              className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700 disabled:opacity-50 cursor-pointer"
            >
              {resendingAgreement ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send Agreement to Location
            </button>
          </div>
          {resendResult && (
            <p className={`mt-2 text-xs ${resendResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
              {resendResult}
            </p>
          )}
        </div>
      )}

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
                  {step.requires_order && <ClipboardList className="h-3 w-3 opacity-50" />}
                  {step.requires_document && <Lock className="h-3 w-3 opacity-50" />}
                  {step.requires_signature && <PenTool className="h-3 w-3 opacity-50" />}
                  {step.requires_payment && <CreditCard className="h-3 w-3 opacity-50" />}
                  {step.requires_admin_approval && <ShieldCheck className="h-3 w-3 opacity-50" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pricing Engine */}
      {item.location_id && !isCompleted && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-gray-400" />
              Pricing Engine
            </h2>
            {pricingData && (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-bold">
                  ${pricingData.price.toLocaleString()}
                </span>
                <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">
                  {pricingData.tier_label}
                </span>
                <span className="text-xs text-gray-400">Score: {pricingData.total_score}/100</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Employees</label>
              <input
                type="number"
                min="0"
                value={pricingInputs.employees}
                onChange={(e) => setPricingInputs((p) => ({ ...p, employees: Number(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Foot Traffic</label>
              <input
                type="number"
                min="0"
                value={pricingInputs.foot_traffic}
                onChange={(e) => setPricingInputs((p) => ({ ...p, foot_traffic: Number(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Business Hours</label>
              <select
                value={pricingInputs.business_hours}
                onChange={(e) => setPricingInputs((p) => ({ ...p, business_hours: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="low">8 Hours</option>
                <option value="medium">12 Hours</option>
                <option value="high">16 Hours</option>
                <option value="24/7">24 Hours</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Machines</label>
              <select
                value={pricingInputs.machines_requested}
                onChange={(e) => setPricingInputs((p) => ({ ...p, machines_requested: Number(e.target.value) }))}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleRecalculatePricing}
              disabled={calculatingPricing}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
            >
              {calculatingPricing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
              {calculatingPricing ? "Calculating..." : "Recalculate"}
            </button>
            {pricingData && (
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Traffic: {pricingData.traffic_score}</span>
                <span>Hours: {pricingData.hours_score}</span>
                <span>Machines: {pricingData.machine_score}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Sales Agreement (in-house agreement flow) */}
      {currentStep && item.location_id && (currentStep.requires_payment || currentStep.requires_signature) && !isCompleted && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Send className="h-4 w-4 text-gray-400" />
              Sales Agreement
            </h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              item.proposal_status === "paid" ? "bg-green-100 text-green-700" :
              item.proposal_status === "proposal_sent" ? "bg-blue-100 text-blue-600" :
              "bg-gray-100 text-gray-500"
            }`}>
              {item.proposal_status === "paid" ? "Signed & Paid" :
               item.proposal_status === "proposal_sent" ? "Sent" :
               "Not Sent"}
            </span>
          </div>
          {esignDocs.length > 0 && (
            <div className="space-y-2 mb-4">
              {esignDocs.map((doc) => (
                <div key={doc.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  doc.status === "completed" ? "border-green-200 bg-green-50" :
                  doc.status === "sent" || doc.status === "viewed" ? "border-blue-200 bg-blue-50" :
                  "border-gray-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {doc.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                     doc.status === "sent" || doc.status === "viewed" ? <Clock className="h-4 w-4 text-blue-500" /> :
                     <FileText className="h-4 w-4 text-gray-400" />}
                    <div>
                      <span className="text-sm text-gray-900">{doc.document_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{doc.recipient_email}</span>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    doc.status === "completed" ? "bg-green-100 text-green-700" :
                    doc.status === "sent" ? "bg-blue-100 text-blue-600" :
                    doc.status === "viewed" ? "bg-yellow-100 text-yellow-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{doc.status}</span>
                </div>
              ))}
            </div>
          )}
          {proposalError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              {proposalError}
            </div>
          )}
          {item.proposal_status === "paid" ? (
            <p className="text-sm text-green-600 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Payment received — full location details sent to customer
            </p>
          ) : item.proposal_status === "proposal_sent" ? (
            <p className="text-sm text-blue-600 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Agreement sent — waiting for customer signature &amp; payment
            </p>
          ) : (
            <>
              <button
                onClick={handleSendProposal}
                disabled={sendingProposal || !item.sales_accounts?.email}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {sendingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendingProposal ? "Sending..." : "Send Sales Agreement"}
              </button>
              {!item.sales_accounts?.email && (
                <p className="mt-2 text-xs text-red-500">Link an account with an email address to send the agreement.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Current Step Documents (manual upload — hidden when agreement flow is active) */}
      {currentStep && currentStep.requires_document && currentStep.step_documents.length > 0 && !isCompleted && !item.location_id && !currentStep.pandadoc_full_template_id && (
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
                    <div className="flex items-center gap-2">
                      {uploadedDoc?.file_url && (
                        <a
                          href={uploadedDoc.file_url.startsWith("http") ? uploadedDoc.file_url : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sales-documents/${uploadedDoc.file_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <ExternalLink className="h-3 w-3" /> View
                        </a>
                      )}
                      <span className="text-xs text-green-600 font-medium">Completed</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* E-Signature Section (hidden when in-house agreement flow is active) */}
      {currentStep?.requires_signature && !isCompleted && !item.location_id && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <PenTool className="h-4 w-4 text-gray-400" />
            E-Signature — {currentStep.name}
          </h2>
          {esignDocs.length > 0 && (
            <div className="space-y-2 mb-4">
              {esignDocs.map((doc) => (
                <div key={doc.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  doc.status === "completed" ? "border-green-200 bg-green-50" :
                  doc.status === "sent" || doc.status === "viewed" ? "border-blue-200 bg-blue-50" :
                  "border-gray-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {doc.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                     doc.status === "sent" || doc.status === "viewed" ? <Clock className="h-4 w-4 text-blue-500" /> :
                     <FileText className="h-4 w-4 text-gray-400" />}
                    <div>
                      <span className="text-sm text-gray-900">{doc.document_name}</span>
                      <span className="text-xs text-gray-400 ml-2">{doc.recipient_email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      doc.status === "completed" ? "bg-green-100 text-green-700" :
                      doc.status === "sent" ? "bg-blue-100 text-blue-600" :
                      doc.status === "viewed" ? "bg-yellow-100 text-yellow-700" :
                      doc.status === "declined" ? "bg-red-100 text-red-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>{doc.status}</span>
                    {doc.signed_pdf_url && (
                      <a href={doc.signed_pdf_url} target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> PDF
                      </a>
                    )}
                    {doc.status !== "completed" && (
                      <button onClick={() => handleMarkEsignComplete(doc.id)} className="text-xs text-gray-500 hover:text-green-600 cursor-pointer">Mark Complete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {gating && !gating.requirements.signature.completed && (
            <div className="rounded-lg border border-dashed border-gray-300 p-4">
              <p className="text-xs text-gray-500 mb-3">Send a document for e-signature:</p>
              <div className="flex gap-2 flex-wrap">
                <input value={esignForm.document_name} onChange={(e) => setEsignForm((f) => ({ ...f, document_name: e.target.value }))} placeholder="Document name *" className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                <input value={esignForm.recipient_email} onChange={(e) => setEsignForm((f) => ({ ...f, recipient_email: e.target.value }))} placeholder="Recipient email *" className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                <input value={esignForm.template_id} onChange={(e) => setEsignForm((f) => ({ ...f, template_id: e.target.value }))} placeholder="PandaDoc Template ID" className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </div>
              <button onClick={handleSendEsign} disabled={sendingEsign || !esignForm.document_name || !esignForm.recipient_email} className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                {sendingEsign ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {sendingEsign ? "Sending..." : "Send for Signature"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Payment Section (hidden when in-house agreement flow is active) */}
      {currentStep?.requires_payment && !isCompleted && !item.location_id && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-400" />
            Payment — {currentStep.name}
            {currentStep.payment_amount && (
              <span className="text-xs text-green-600 font-medium">${Number(currentStep.payment_amount).toLocaleString()}</span>
            )}
          </h2>
          {payments.length > 0 ? (
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                  p.status === "completed" ? "border-green-200 bg-green-50" :
                  p.status === "created" || p.status === "approved" ? "border-blue-200 bg-blue-50" :
                  p.status === "failed" ? "border-red-200 bg-red-50" :
                  "border-gray-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {p.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                     p.status === "failed" ? <AlertTriangle className="h-4 w-4 text-red-500" /> :
                     <DollarSign className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm text-gray-900">${Number(p.amount).toLocaleString()} {p.currency}</span>
                    {p.description && <span className="text-xs text-gray-400">— {p.description}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.status === "completed" ? "bg-green-100 text-green-700" :
                      p.status === "created" ? "bg-blue-100 text-blue-600" :
                      p.status === "failed" ? "bg-red-100 text-red-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>{p.status}</span>
                    {p.payment_url && p.status !== "completed" && (
                      <a href={p.payment_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                        <ExternalLink className="h-3 w-3" /> Pay Link
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <button onClick={handleCreatePayment} disabled={creatingPayment} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
              {creatingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
              {creatingPayment ? "Creating..." : "Generate Payment Link"}
            </button>
          )}
        </div>
      )}

      {/* Admin Approval Section */}
      {currentStep?.requires_admin_approval && !isCompleted && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gray-400" />
            Admin Approval — {currentStep.name}
          </h2>
          {gating?.requirements.adminApproval.completed ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700 font-medium">Approved</span>
            </div>
          ) : (
            <button onClick={handleApproveStep} disabled={approvingStep} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer">
              {approvingStep ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {approvingStep ? "Approving..." : "Approve Step"}
            </button>
          )}
        </div>
      )}

      {/* Step Gating Summary */}
      {gating && !isCompleted && currentStep && (gating.requirements.order?.required || gating.requirements.signature.required || gating.requirements.payment.required || gating.requirements.adminApproval.required) && (
        <div className={`rounded-xl border p-4 mb-6 ${gating.canAdvance ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2 mb-2">
            {gating.canAdvance ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Lock className="h-4 w-4 text-amber-600" />}
            <span className={`text-sm font-medium ${gating.canAdvance ? "text-green-700" : "text-amber-800"}`}>
              {gating.canAdvance ? "All requirements met — ready to advance" : "Step locked — requirements incomplete"}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {gating.requirements.order?.required && (
              <span className={`flex items-center gap-1 ${gating.requirements.order.completed ? "text-green-600" : "text-amber-700"}`}>
                {gating.requirements.order.completed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />} Order
              </span>
            )}
            {gating.requirements.documents.required && (
              <span className={`flex items-center gap-1 ${gating.requirements.documents.completed ? "text-green-600" : "text-amber-700"}`}>
                {gating.requirements.documents.completed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />} Documents
              </span>
            )}
            {gating.requirements.signature.required && (
              <span className={`flex items-center gap-1 ${gating.requirements.signature.completed ? "text-green-600" : "text-amber-700"}`}>
                {gating.requirements.signature.completed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />} E-Signature
              </span>
            )}
            {gating.requirements.payment.required && (
              <span className={`flex items-center gap-1 ${gating.requirements.payment.completed ? "text-green-600" : "text-amber-700"}`}>
                {gating.requirements.payment.completed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />} Payment
              </span>
            )}
            {gating.requirements.adminApproval.required && (
              <span className={`flex items-center gap-1 ${gating.requirements.adminApproval.completed ? "text-green-600" : "text-amber-700"}`}>
                {gating.requirements.adminApproval.completed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />} Admin Approval
              </span>
            )}
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
          {gating && gating.blockers.length > 0 && missingDocs.length === 0 && (
            <ul className="mt-2 ml-6 list-disc text-xs text-amber-700">
              {gating.blockers.map((b, i) => <li key={i}>{b}</li>)}
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

      {/* Create Order Modal */}
      {showCreateOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Create Order</h2>
              <button onClick={() => setShowCreateOrder(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              {/* Operator Account */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Operator Account</label>
                {selectedOperator ? (
                  <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{selectedOperator.business_name}</p>
                        <p className="text-xs text-gray-500">{[selectedOperator.contact_name, selectedOperator.email].filter(Boolean).join(" · ")}</p>
                      </div>
                    </div>
                    <button onClick={() => setOrderOperatorId(null)} className="text-xs text-red-500 hover:text-red-600 cursor-pointer">Change</button>
                  </div>
                ) : (
                  <div>
                    <div className="relative mb-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={orderOperatorSearch}
                        onChange={(e) => setOrderOperatorSearch(e.target.value)}
                        placeholder="Search operators..."
                        className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-green-500 focus:outline-none"
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white max-h-48 overflow-y-auto">
                      {filteredOperatorAccounts.length > 0 ? (
                        filteredOperatorAccounts.map((a) => (
                          <button key={a.id} onClick={() => { setOrderOperatorId(a.id); setOrderOperatorSearch(""); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-pointer">
                            <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{a.business_name}</p>
                              <p className="text-xs text-gray-400 truncate">{[a.contact_name, a.email].filter(Boolean).join(" · ")}</p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-sm text-gray-400 text-center">No operator accounts found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Location */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Location</label>
                {orderSelectedLocation ? (
                  <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 mb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{orderSelectedLocation.location_name}</p>
                        <p className="text-xs text-gray-500">{[orderSelectedLocation.address, orderSelectedLocation.industry, orderSelectedLocation.zip].filter(Boolean).join(" · ")}</p>
                      </div>
                    </div>
                    <button onClick={() => { setOrderSelectedLocation(null); setOrderLocationForm({ location_name: "", address: "", phone: "", decision_maker_name: "", decision_maker_email: "", industry: "", zip: "", employee_count: "", traffic_count: "", machine_type: "", business_hours: "8", machines_requested: "1" }); }} className="text-xs text-red-500 hover:text-red-600 cursor-pointer">Change</button>
                  </div>
                ) : (
                  <div className="mb-3">
                    <div className="relative mb-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={orderLocationSearch}
                        onChange={(e) => setOrderLocationSearch(e.target.value)}
                        placeholder="Search locations..."
                        className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm focus:border-green-500 focus:outline-none"
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white max-h-48 overflow-y-auto">
                      {filteredLocations.length > 0 ? (
                        filteredLocations.map((l) => (
                          <button key={l.id} onClick={() => handleSelectLocation(l)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-pointer">
                            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{l.location_name || "Unnamed location"}</p>
                              <p className="text-xs text-gray-400 truncate">{[l.address, l.industry, l.zip].filter(Boolean).join(" · ")}</p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-sm text-gray-400 text-center">No locations found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Location Details Form */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Location Details</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <input value={orderLocationForm.location_name} onChange={(e) => setOrderLocationForm((f) => ({ ...f, location_name: e.target.value }))} placeholder="Location Name *" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  </div>
                  <div className="col-span-2">
                    <input value={orderLocationForm.address} onChange={(e) => setOrderLocationForm((f) => ({ ...f, address: e.target.value }))} placeholder="Address" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  </div>
                  <input value={orderLocationForm.industry} onChange={(e) => setOrderLocationForm((f) => ({ ...f, industry: e.target.value }))} placeholder="Industry *" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  <input value={orderLocationForm.zip} onChange={(e) => setOrderLocationForm((f) => ({ ...f, zip: e.target.value }))} placeholder="ZIP Code *" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  <input value={orderLocationForm.employee_count} onChange={(e) => setOrderLocationForm((f) => ({ ...f, employee_count: e.target.value }))} placeholder="Employee Count *" type="number" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  <input value={orderLocationForm.traffic_count} onChange={(e) => setOrderLocationForm((f) => ({ ...f, traffic_count: e.target.value }))} placeholder="Foot Traffic *" type="number" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  <input value={orderLocationForm.decision_maker_name} onChange={(e) => setOrderLocationForm((f) => ({ ...f, decision_maker_name: e.target.value }))} placeholder="Decision Maker Name" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  <input value={orderLocationForm.decision_maker_email} onChange={(e) => setOrderLocationForm((f) => ({ ...f, decision_maker_email: e.target.value }))} placeholder="Decision Maker Email" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  <input value={orderLocationForm.phone} onChange={(e) => setOrderLocationForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  <select value={orderLocationForm.machine_type} onChange={(e) => setOrderLocationForm((f) => ({ ...f, machine_type: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none">
                    <option value="">Machine Type</option>
                    <option value="ai">AI Vending Machine</option>
                    <option value="snack">Snack</option>
                    <option value="beverage">Beverage</option>
                    <option value="combo">Combo</option>
                    <option value="healthy">Healthy</option>
                    <option value="coffee">Coffee</option>
                    <option value="frozen">Frozen</option>
                    <option value="fresh_food">Fresh Food</option>
                  </select>
                  <select value={orderLocationForm.machines_requested} onChange={(e) => setOrderLocationForm((f) => ({ ...f, machines_requested: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none">
                    <option value="1">1 Machine</option>
                    <option value="2">2 Machines</option>
                    <option value="3">3 Machines</option>
                    <option value="4">4 Machines</option>
                  </select>
                  <select value={orderLocationForm.business_hours} onChange={(e) => setOrderLocationForm((f) => ({ ...f, business_hours: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none">
                    <option value="8">Business Hours: 8</option>
                    <option value="12">Business Hours: 12</option>
                    <option value="16">Business Hours: 16</option>
                    <option value="24">Business Hours: 24</option>
                  </select>
                </div>
              </div>

              {orderError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{orderError}</div>
              )}

              <button
                onClick={handleCreateOrder}
                disabled={orderSaving || !orderOperatorId || !orderLocationForm.location_name || !orderLocationForm.industry || !orderLocationForm.zip || !orderLocationForm.employee_count || !orderLocationForm.traffic_count}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {orderSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {orderSaving ? "Creating Order..." : "Create Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
