"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { US_STATES, US_STATE_NAMES } from "@/lib/types";
import {
  Loader2,
  ArrowLeft,
  Save,
  Send,
  Download,
  FileText,
  Trash2,
  Eye,
  Shield,
  X,
  CheckCircle2,
  AlertCircle,
  Building2,
  Package,
  MapPin,
  Truck,
  DollarSign,
  Settings,
  Clock,
  Activity,
  Ban,
  ClipboardList,
  UserPlus,
} from "lucide-react";

interface AgreementActivity {
  id: string;
  activity_type: string;
  description: string | null;
  user_id: string | null;
  created_at: string;
}

interface Agreement {
  id: string;
  order_id: string | null;
  account_id: string | null;
  operator_id: string | null;
  created_by: string | null;
  agreement_status: string;
  agreement_type: string;
  template_version: number;
  sign_token: string;
  operator_company_name: string | null;
  operator_legal_name: string | null;
  operator_email: string | null;
  operator_phone: string | null;
  operator_billing_address: string | null;
  operator_delivery_address: string | null;
  operator_title: string | null;
  apex_company_name: string | null;
  apex_representative_name: string | null;
  apex_representative_title: string | null;
  apex_representative_email: string | null;
  machine_model: string | null;
  machine_quantity: number;
  machine_unit_price: number;
  equipment_subtotal: number;
  machine_notes: string | null;
  locations_purchased: number;
  location_fee_per_secured: number;
  max_location_service_value: number;
  location_rejection_allowance: string | null;
  location_service_timeline_days: number;
  location_payment_terms: string | null;
  standard_freight_rate: number;
  discounted_freight_rate: number;
  freight_per_machine: number;
  freight_total: number;
  shipping_notes: string | null;
  storage_fee_per_machine_month: number;
  free_storage_months: number;
  total_due_prior_to_procurement: number;
  payment_due_date: string | null;
  payment_method_notes: string | null;
  include_equipment: boolean;
  include_location_services: boolean;
  include_shipping_storage: boolean;
  auto_send_invoice_on_signing: boolean;
  location_services_deposit_only: boolean;
  location_services_deposit_amount: number;
  // Location Placement Agreement fields
  location_business_name: string | null;
  location_contact_name: string | null;
  location_contact_email: string | null;
  location_contact_phone: string | null;
  location_contact_title: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  placement_machine_count: number | null;
  placement_machine_type: string | null;
  placement_installation_date: string | null;
  placement_term_months: number | null;
  placement_exclusivity: boolean | null;
  placement_notes: string | null;
  commission_type: string | null;
  commission_pct: number | null;
  commission_monthly_fee: number | null;
  commission_payout_schedule: string | null;
  commission_notes: string | null;
  placement_operator_company: string | null;
  placement_operator_contact: string | null;
  placement_operator_email: string | null;
  placement_operator_phone: string | null;
  rep_name: string | null;
  rep_email: string | null;
  include_placement_terms: boolean | null;
  include_compensation: boolean | null;
  include_duration_termination: boolean | null;
  include_responsibilities: boolean | null;
  effective_date: string | null;
  governing_state: string | null;
  venue_state: string | null;
  contract_expiration_date: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  legal_overrides: Record<string, string>;
  pdf_url: string | null;
  signed_pdf_url: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  operator_signed_at: string | null;
  apex_signed_at: string | null;
  created_at: string;
  updated_at: string;
  signatures: Array<{
    id: string;
    signer_type: string;
    signer_name: string;
    signed_at: string;
  }>;
  initials: Array<{
    id: string;
    section_key: string;
    signer_type: string;
    initialed_at: string;
  }>;
  activity: AgreementActivity[];
}

type FormData = {
  operator_company_name: string;
  operator_legal_name: string;
  operator_email: string;
  operator_phone: string;
  operator_billing_address: string;
  operator_delivery_address: string;
  operator_title: string;
  machine_model: string;
  machine_quantity: string;
  machine_unit_price: string;
  machine_notes: string;
  locations_purchased: string;
  location_fee_per_secured: string;
  location_rejection_allowance: string;
  location_service_timeline_days: string;
  location_payment_terms: string;
  standard_freight_rate: string;
  discounted_freight_rate: string;
  freight_per_machine: string;
  shipping_notes: string;
  storage_fee_per_machine_month: string;
  free_storage_months: string;
  payment_due_date: string;
  payment_method_notes: string;
  effective_date: string;
  governing_state: string;
  venue_state: string;
  contract_expiration_date: string;
  internal_notes: string;
  customer_notes: string;
  include_equipment: boolean;
  include_location_services: boolean;
  include_shipping_storage: boolean;
  auto_send_invoice_on_signing: boolean;
  location_services_deposit_only: boolean;
  location_services_deposit_amount: string;
  // Location Placement Agreement fields
  location_business_name: string;
  location_contact_name: string;
  location_contact_email: string;
  location_contact_phone: string;
  location_contact_title: string;
  location_address: string;
  location_city: string;
  location_state: string;
  location_zip: string;
  placement_machine_count: string;
  placement_machine_type: string;
  placement_installation_date: string;
  placement_term_months: string;
  placement_exclusivity: boolean;
  placement_notes: string;
  commission_type: string;
  commission_pct: string;
  commission_monthly_fee: string;
  commission_payout_schedule: string;
  commission_notes: string;
  placement_operator_company: string;
  placement_operator_contact: string;
  placement_operator_email: string;
  placement_operator_phone: string;
  rep_name: string;
  rep_email: string;
  include_placement_terms: boolean;
  include_compensation: boolean;
  include_duration_termination: boolean;
  include_responsibilities: boolean;
};

const AGREEMENT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-50 text-gray-600 ring-gray-200",
  generated: "bg-blue-50 text-blue-700 ring-blue-200",
  sent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  viewed: "bg-purple-50 text-purple-700 ring-purple-200",
  partially_signed: "bg-amber-50 text-amber-700 ring-amber-200",
  signed: "bg-green-50 text-green-700 ring-green-200",
  cancelled: "bg-red-50 text-red-600 ring-red-200",
  expired: "bg-gray-50 text-gray-500 ring-gray-200",
};

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function currency(v: number | string | null | undefined): string {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function agreementToForm(ag: Agreement): FormData {
  return {
    operator_company_name: ag.operator_company_name || "",
    operator_legal_name: ag.operator_legal_name || "",
    operator_email: ag.operator_email || "",
    operator_phone: ag.operator_phone || "",
    operator_billing_address: ag.operator_billing_address || "",
    operator_delivery_address: ag.operator_delivery_address || "",
    operator_title: ag.operator_title || "",
    machine_model: ag.machine_model || "",
    machine_quantity: String(ag.machine_quantity || 1),
    machine_unit_price: String(ag.machine_unit_price || 0),
    machine_notes: ag.machine_notes || "",
    locations_purchased: String(ag.locations_purchased || 0),
    location_fee_per_secured: String(ag.location_fee_per_secured || 0),
    location_rejection_allowance: ag.location_rejection_allowance || "",
    location_service_timeline_days: String(ag.location_service_timeline_days || 180),
    location_payment_terms: ag.location_payment_terms || "",
    standard_freight_rate: String(ag.standard_freight_rate || 0),
    discounted_freight_rate: String(ag.discounted_freight_rate || 0),
    freight_per_machine: String(ag.freight_per_machine || 0),
    shipping_notes: ag.shipping_notes || "",
    storage_fee_per_machine_month: String(ag.storage_fee_per_machine_month || 0),
    free_storage_months: String(ag.free_storage_months || 0),
    payment_due_date: ag.payment_due_date || "",
    payment_method_notes: ag.payment_method_notes || "",
    effective_date: ag.effective_date || "",
    governing_state: ag.governing_state || "Texas",
    venue_state: ag.venue_state || "Texas",
    contract_expiration_date: ag.contract_expiration_date || "",
    internal_notes: ag.internal_notes || "",
    customer_notes: ag.customer_notes || "",
    include_equipment: ag.include_equipment !== false,
    include_location_services: ag.include_location_services !== false,
    include_shipping_storage: ag.include_shipping_storage !== false,
    auto_send_invoice_on_signing: ag.auto_send_invoice_on_signing === true,
    location_services_deposit_only: ag.location_services_deposit_only === true,
    location_services_deposit_amount: String(ag.location_services_deposit_amount ?? 100),
    // Location Placement Agreement
    location_business_name: ag.location_business_name || "",
    location_contact_name: ag.location_contact_name || "",
    location_contact_email: ag.location_contact_email || "",
    location_contact_phone: ag.location_contact_phone || "",
    location_contact_title: ag.location_contact_title || "",
    location_address: ag.location_address || "",
    location_city: ag.location_city || "",
    location_state: ag.location_state || "",
    location_zip: ag.location_zip || "",
    placement_machine_count: String(ag.placement_machine_count ?? 1),
    placement_machine_type: ag.placement_machine_type || "VendEra AI Machine",
    placement_installation_date: ag.placement_installation_date || "",
    placement_term_months: String(ag.placement_term_months ?? 24),
    placement_exclusivity: ag.placement_exclusivity !== false,
    placement_notes: ag.placement_notes || "",
    commission_type: ag.commission_type || "revenue_share",
    commission_pct: String(ag.commission_pct ?? 10),
    commission_monthly_fee: String(ag.commission_monthly_fee ?? 0),
    commission_payout_schedule: ag.commission_payout_schedule || "monthly",
    commission_notes: ag.commission_notes || "",
    placement_operator_company: ag.placement_operator_company || "",
    placement_operator_contact: ag.placement_operator_contact || "",
    placement_operator_email: ag.placement_operator_email || "",
    placement_operator_phone: ag.placement_operator_phone || "",
    rep_name: ag.rep_name || "",
    rep_email: ag.rep_email || "",
    include_placement_terms: ag.include_placement_terms !== false,
    include_compensation: ag.include_compensation !== false,
    include_duration_termination: ag.include_duration_termination !== false,
    include_responsibilities: ag.include_responsibilities !== false,
  };
}

function StandaloneAgreementEditor() {
  const { id: agreementId } = useParams<{ id: string }>();
  const router = useRouter();

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [form, setForm] = useState<FormData | null>(null);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showApexSign, setShowApexSign] = useState(false);
  const [apexSigning, setApexSigning] = useState(false);
  const [apexSignForm, setApexSignForm] = useState({ signer_name: "", signer_title: "", signature_data: "" });
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const fetchAgreement = useCallback(async () => {
    if (!token || !agreementId) return;
    const res = await fetch(`/api/sales/agreements/${agreementId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: Agreement = await res.json();
      setAgreement(data);
      setForm(agreementToForm(data));
      setDirty(false);
    } else {
      showToast("Failed to load agreement", "error");
    }
    setLoading(false);
  }, [token, agreementId]);

  useEffect(() => {
    fetchAgreement();
  }, [fetchAgreement]);

  function updateBool(field: keyof FormData, value: boolean) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setDirty(true);
  }

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setDirty(true);
  }

  const computed = useMemo(() => {
    if (!form) return { equipmentSubtotal: 0, freightTotal: 0, maxLocationServiceValue: 0, locationUpfront: 0, locationRemaining: 0, totalDue: 0 };
    const qty = Number(form.machine_quantity) || 0;
    const unitPrice = Number(form.machine_unit_price) || 0;
    const freightPerMachine = Number(form.freight_per_machine) || 0;
    const locPurchased = Number(form.locations_purchased) || 0;
    const locFee = Number(form.location_fee_per_secured) || 0;
    const depositAmount = Number(form.location_services_deposit_amount) || 0;

    const equipmentSubtotal = form.include_equipment ? qty * unitPrice : 0;
    const freightTotal = form.include_shipping_storage ? qty * freightPerMachine : 0;
    const maxLocationServiceValue = form.include_location_services ? locPurchased * locFee : 0;

    // When deposit-only is on, only the deposit is due upfront. The rest is due on fulfillment.
    const locationUpfront = form.include_location_services
      ? (form.location_services_deposit_only ? Math.min(depositAmount, maxLocationServiceValue) : maxLocationServiceValue)
      : 0;
    const locationRemaining = form.include_location_services && form.location_services_deposit_only
      ? Math.max(0, maxLocationServiceValue - depositAmount)
      : 0;

    const totalDue = equipmentSubtotal + freightTotal + locationUpfront;

    return { equipmentSubtotal, freightTotal, maxLocationServiceValue, locationUpfront, locationRemaining, totalDue };
  }, [form]);

  async function handleSave() {
    if (!agreement || !form) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      operator_company_name: form.operator_company_name,
      operator_legal_name: form.operator_legal_name,
      operator_email: form.operator_email,
      operator_phone: form.operator_phone,
      operator_billing_address: form.operator_billing_address,
      operator_delivery_address: form.operator_delivery_address,
      operator_title: form.operator_title,
      machine_model: form.machine_model,
      machine_quantity: Number(form.machine_quantity) || 1,
      machine_unit_price: Number(form.machine_unit_price) || 0,
      machine_notes: form.machine_notes,
      locations_purchased: Number(form.locations_purchased) || 0,
      location_fee_per_secured: Number(form.location_fee_per_secured) || 0,
      location_rejection_allowance: form.location_rejection_allowance,
      location_service_timeline_days: Number(form.location_service_timeline_days) || 180,
      location_payment_terms: form.location_payment_terms,
      standard_freight_rate: Number(form.standard_freight_rate) || 0,
      discounted_freight_rate: Number(form.discounted_freight_rate) || 0,
      freight_per_machine: Number(form.freight_per_machine) || 0,
      shipping_notes: form.shipping_notes,
      storage_fee_per_machine_month: Number(form.storage_fee_per_machine_month) || 0,
      free_storage_months: Number(form.free_storage_months) || 0,
      payment_due_date: form.payment_due_date || null,
      payment_method_notes: form.payment_method_notes,
      effective_date: form.effective_date || null,
      governing_state: form.governing_state,
      venue_state: form.venue_state,
      contract_expiration_date: form.contract_expiration_date || null,
      internal_notes: form.internal_notes,
      customer_notes: form.customer_notes,
      include_equipment: form.include_equipment,
      include_location_services: form.include_location_services,
      include_shipping_storage: form.include_shipping_storage,
      auto_send_invoice_on_signing: form.auto_send_invoice_on_signing,
      location_services_deposit_only: form.location_services_deposit_only,
      location_services_deposit_amount: Number(form.location_services_deposit_amount) || 0,
      // Location Placement Agreement
      location_business_name: form.location_business_name || null,
      location_contact_name: form.location_contact_name || null,
      location_contact_email: form.location_contact_email || null,
      location_contact_phone: form.location_contact_phone || null,
      location_contact_title: form.location_contact_title || null,
      location_address: form.location_address || null,
      location_city: form.location_city || null,
      location_state: form.location_state || null,
      location_zip: form.location_zip || null,
      placement_machine_count: Number(form.placement_machine_count) || 0,
      placement_machine_type: form.placement_machine_type || null,
      placement_installation_date: form.placement_installation_date || null,
      placement_term_months: Number(form.placement_term_months) || 0,
      placement_exclusivity: form.placement_exclusivity,
      placement_notes: form.placement_notes || null,
      commission_type: form.commission_type || null,
      commission_pct: Number(form.commission_pct) || 0,
      commission_monthly_fee: Number(form.commission_monthly_fee) || 0,
      commission_payout_schedule: form.commission_payout_schedule || null,
      commission_notes: form.commission_notes || null,
      placement_operator_company: form.placement_operator_company || null,
      placement_operator_contact: form.placement_operator_contact || null,
      placement_operator_email: form.placement_operator_email || null,
      placement_operator_phone: form.placement_operator_phone || null,
      rep_name: form.rep_name || null,
      rep_email: form.rep_email || null,
      include_placement_terms: form.include_placement_terms,
      include_compensation: form.include_compensation,
      include_duration_termination: form.include_duration_termination,
      include_responsibilities: form.include_responsibilities,
    };

    const res = await fetch(`/api/sales/agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const updated = await res.json();
      setAgreement((prev) => (prev ? { ...prev, ...updated } : prev));
      setDirty(false);
      showToast("Changes saved");
    } else {
      const err = await res.json().catch(() => ({ error: "Save failed" }));
      showToast(err.error || "Failed to save", "error");
    }
    setSaving(false);
  }

  async function handleSend() {
    if (!agreement) return;

    if (!form?.operator_email?.trim()) {
      showToast("Operator email is required to send", "error");
      return;
    }
    if (!form?.operator_company_name?.trim()) {
      showToast("Operator company name is required to send", "error");
      return;
    }
    if (!form?.operator_legal_name?.trim()) {
      showToast("Operator legal name is required to send", "error");
      return;
    }

    if (dirty) {
      showToast("Please save changes before sending", "error");
      return;
    }

    if (!confirm("Send this agreement to the operator? They will receive an email with a signing link.")) return;

    setSending(true);
    const res = await fetch(`/api/sales/agreements/${agreement.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      showToast("Agreement sent to operator");
      await fetchAgreement();
    } else {
      const err = await res.json().catch(() => ({ error: "Send failed" }));
      showToast(err.error || "Failed to send agreement", "error");
    }
    setSending(false);
  }

  function handleDownloadPdf() {
    if (!agreement) return;
    window.open(`/api/sales/agreements/${agreement.id}/pdf`, "_blank");
  }

  async function handleDelete() {
    if (!agreement) return;
    if (!confirm("Delete this draft agreement? This cannot be undone.")) return;

    setDeleting(true);
    const res = await fetch(`/api/sales/agreements/${agreement.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      showToast("Agreement deleted");
      router.push("/sales/agreements");
    } else {
      const err = await res.json().catch(() => ({ error: "Delete failed" }));
      showToast(err.error || "Failed to delete", "error");
    }
    setDeleting(false);
  }

  async function handleCancel() {
    if (!agreement) return;
    if (!confirm("Cancel this agreement? The operator will no longer be able to sign it.")) return;

    const res = await fetch(`/api/sales/agreements/${agreement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ agreement_status: "cancelled" } as Record<string, unknown>),
    });

    if (res.ok) {
      showToast("Agreement cancelled");
      await fetchAgreement();
    } else {
      showToast("Failed to cancel agreement", "error");
    }
  }

  async function handleApexSign() {
    if (!agreement) return;
    if (!apexSignForm.signer_name.trim()) {
      showToast("Signer name is required", "error");
      return;
    }
    if (!apexSignForm.signature_data.trim()) {
      showToast("Signature is required", "error");
      return;
    }

    setApexSigning(true);
    const res = await fetch(`/api/sales/agreements/${agreement.id}/apex-sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        signer_name: apexSignForm.signer_name.trim(),
        signer_title: apexSignForm.signer_title.trim() || undefined,
        signature_data: apexSignForm.signature_data.trim(),
        signature_type: "typed",
      }),
    });

    if (res.ok) {
      const data = await res.json();
      showToast(data.fully_executed ? "Agreement fully executed!" : "Apex countersignature recorded");
      setShowApexSign(false);
      setApexSignForm({ signer_name: "", signer_title: "", signature_data: "" });
      await fetchAgreement();
    } else {
      const err = await res.json().catch(() => ({ error: "Failed to sign" }));
      showToast(err.error || "Failed to countersign", "error");
    }
    setApexSigning(false);
  }

  async function handleCreateOrder() {
    if (!agreement) return;
    if (agreement.order_id) {
      router.push(`/sales/orders/${agreement.order_id}`);
      return;
    }
    if (!confirm("Create a sales order from this agreement? All agreement data will carry over automatically.")) return;

    setCreatingOrder(true);
    const res = await fetch(`/api/sales/agreements/${agreement.id}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      showToast("Order created from agreement");
      router.push(`/sales/orders/${data.order_id}`);
    } else {
      const err = await res.json().catch(() => ({ error: "Failed to create order" }));
      showToast(err.error || "Failed to create order", "error");
    }
    setCreatingOrder(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-green-600" />
      </div>
    );
  }

  if (!agreement || !form) {
    return (
      <div className="p-6 max-w-6xl">
        <button
          onClick={() => router.push("/sales/agreements")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600 mb-4 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Agreements
        </button>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Agreement Not Found</h2>
          <p className="text-sm text-gray-500">This agreement may have been deleted or does not exist.</p>
        </div>
      </div>
    );
  }

  const isDraft = ["draft", "generated"].includes(agreement.agreement_status);
  const isSigned = agreement.agreement_status === "signed";
  const isCancelled = agreement.agreement_status === "cancelled";
  const isReadOnly = isSigned || isCancelled;

  return (
    <div className="p-6 max-w-7xl">
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {showPreview && (
        <AgreementPreviewModal
          form={form}
          computed={computed}
          agreement={agreement}
          onClose={() => setShowPreview(false)}
        />
      )}

      {showApexSign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Apex Countersignature</h2>
                <p className="text-xs text-gray-500">Sign on behalf of Apex AI Vending LLC</p>
              </div>
              <button onClick={() => setShowApexSign(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Your Name <span className="text-red-400">*</span></label>
                <input type="text" value={apexSignForm.signer_name} onChange={(e) => setApexSignForm((f) => ({ ...f, signer_name: e.target.value }))} placeholder="e.g. James Padden" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                <input type="text" value={apexSignForm.signer_title} onChange={(e) => setApexSignForm((f) => ({ ...f, signer_title: e.target.value }))} placeholder="e.g. Director of Sales" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type Your Signature <span className="text-red-400">*</span></label>
                <input type="text" value={apexSignForm.signature_data} onChange={(e) => setApexSignForm((f) => ({ ...f, signature_data: e.target.value }))} placeholder="Type your full name as signature" className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600/30" style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive", fontSize: "1.25rem" }} />
                {apexSignForm.signature_data && (
                  <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50 px-4 py-3 text-center">
                    <p className="text-xs text-purple-500 mb-1">Preview</p>
                    <p style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive", fontSize: "1.5rem" }} className="text-purple-800">{apexSignForm.signature_data}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button onClick={() => setShowApexSign(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
              <button onClick={handleApexSign} disabled={apexSigning} className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-2">
                {apexSigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {apexSigning ? "Signing..." : "Countersign Agreement"}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => router.push("/sales/agreements")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600 mb-4 cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Agreements
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {agreement.agreement_type === "location_placement" ? "Location Placement Agreement" : "Purchase Agreement"}
            </h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                AGREEMENT_STATUS_COLORS[agreement.agreement_status] || AGREEMENT_STATUS_COLORS.draft
              }`}
            >
              {formatStatus(agreement.agreement_status)}
            </span>
            {!agreement.order_id && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
                Standalone
              </span>
            )}
            {dirty && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                Unsaved Changes
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {form.operator_company_name || "No company name"} &middot; Created{" "}
            {new Date(agreement.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          )}
          {!isReadOnly && (
            <button
              onClick={handleSend}
              disabled={sending || dirty}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
              title={dirty ? "Save changes first" : ""}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          )}
          <button
            onClick={handleDownloadPdf}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer inline-flex items-center gap-2"
          >
            <Download className="h-4 w-4" /> PDF
          </button>
          {isDraft && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer inline-flex items-center gap-2 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div
          className={`mb-6 rounded-xl border p-4 flex items-center gap-3 ${
            isSigned ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          {isSigned ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          ) : (
            <Ban className="h-5 w-5 text-red-500 shrink-0" />
          )}
          <p className={`text-sm font-medium ${isSigned ? "text-green-800" : "text-red-700"}`}>
            {isSigned
              ? "This agreement has been fully signed and is read-only."
              : "This agreement has been cancelled and is read-only."}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {agreement.agreement_type === "location_placement" && (
            <LocationPlacementSections
              form={form}
              updateField={updateField}
              updateBool={updateBool}
              isReadOnly={isReadOnly}
            />
          )}

          {agreement.agreement_type !== "location_placement" && (
          <>
          {/* Operator Information */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4 text-gray-400" /> Operator Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Company Name" value={form.operator_company_name} onChange={(v) => updateField("operator_company_name", v)} disabled={isReadOnly} required />
              <InputField label="Legal Name / Contact" value={form.operator_legal_name} onChange={(v) => updateField("operator_legal_name", v)} disabled={isReadOnly} required />
              <InputField label="Email" type="email" value={form.operator_email} onChange={(v) => updateField("operator_email", v)} disabled={isReadOnly} required />
              <InputField label="Phone" type="tel" value={form.operator_phone} onChange={(v) => updateField("operator_phone", v)} disabled={isReadOnly} />
              <InputField label="Billing Address" value={form.operator_billing_address} onChange={(v) => updateField("operator_billing_address", v)} disabled={isReadOnly} />
              <InputField label="Delivery Address" value={form.operator_delivery_address} onChange={(v) => updateField("operator_delivery_address", v)} disabled={isReadOnly} />
              <InputField label="Title" value={form.operator_title} onChange={(v) => updateField("operator_title", v)} disabled={isReadOnly} />
            </div>
          </div>

          {/* Equipment Purchase */}
          <div className={`rounded-xl border bg-white p-5 ${form.include_equipment ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" /> Equipment Purchase
              </h3>
              <SectionToggle
                included={form.include_equipment}
                onChange={(v) => updateBool("include_equipment", v)}
                disabled={isReadOnly}
              />
            </div>
            {form.include_equipment && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField label="Machine Model" value={form.machine_model} onChange={(v) => updateField("machine_model", v)} disabled={isReadOnly} />
                  <InputField label="Quantity" type="number" value={form.machine_quantity} onChange={(v) => updateField("machine_quantity", v)} disabled={isReadOnly} min="1" />
                  <CurrencyField label="Unit Price" value={form.machine_unit_price} onChange={(v) => updateField("machine_unit_price", v)} disabled={isReadOnly} />
                  <ReadOnlyField label="Equipment Subtotal" value={`$${currency(computed.equipmentSubtotal)}`} />
                </div>
                <div className="mt-4">
                  <TextareaField label="Machine Notes" value={form.machine_notes} onChange={(v) => updateField("machine_notes", v)} disabled={isReadOnly} rows={2} />
                </div>
              </>
            )}
          </div>

          {/* Location Services */}
          <div className={`rounded-xl border bg-white p-5 ${form.include_location_services ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400" /> Location Services
              </h3>
              <SectionToggle
                included={form.include_location_services}
                onChange={(v) => updateBool("include_location_services", v)}
                disabled={isReadOnly}
              />
            </div>
            {form.include_location_services && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField label="Locations Purchased" type="number" value={form.locations_purchased} onChange={(v) => updateField("locations_purchased", v)} disabled={isReadOnly} min="0" />
                  <CurrencyField label="Fee per Location" value={form.location_fee_per_secured} onChange={(v) => updateField("location_fee_per_secured", v)} disabled={isReadOnly} />
                  <ReadOnlyField label="Max Location Service Value" value={`$${currency(computed.maxLocationServiceValue)}`} />
                  <InputField label="Timeline (Days)" type="number" value={form.location_service_timeline_days} onChange={(v) => updateField("location_service_timeline_days", v)} disabled={isReadOnly} />
                  <InputField label="Rejection Allowance" value={form.location_rejection_allowance} onChange={(v) => updateField("location_rejection_allowance", v)} disabled={isReadOnly} />
                  <InputField label="Payment Terms" value={form.location_payment_terms} onChange={(v) => updateField("location_payment_terms", v)} disabled={isReadOnly} />
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-lg border border-purple-100 bg-purple-50/50 p-3">
                  <input
                    id="location-deposit-only"
                    type="checkbox"
                    checked={form.location_services_deposit_only}
                    onChange={(e) => updateBool("location_services_deposit_only", e.target.checked)}
                    disabled={isReadOnly}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <label htmlFor="location-deposit-only" className="flex-1 cursor-pointer">
                    <span className="block text-sm font-medium text-gray-900">Deposit Only Due Upfront</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Only collect a deposit upfront; the remaining balance is invoiced after fulfillment of secured locations.
                    </span>
                  </label>
                </div>

                {form.location_services_deposit_only && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <CurrencyField
                      label="Deposit Amount"
                      value={form.location_services_deposit_amount}
                      onChange={(v) => updateField("location_services_deposit_amount", v)}
                      disabled={isReadOnly}
                    />
                    <ReadOnlyField label="Due Upfront" value={`$${currency(computed.locationUpfront)}`} highlight />
                    <ReadOnlyField label="Due on Fulfillment" value={`$${currency(computed.locationRemaining)}`} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Shipping & Storage */}
          <div className={`rounded-xl border bg-white p-5 ${form.include_shipping_storage ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Truck className="h-4 w-4 text-gray-400" /> Shipping &amp; Storage
              </h3>
              <SectionToggle
                included={form.include_shipping_storage}
                onChange={(v) => updateBool("include_shipping_storage", v)}
                disabled={isReadOnly}
              />
            </div>
            {form.include_shipping_storage && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CurrencyField label="Standard Freight Rate" value={form.standard_freight_rate} onChange={(v) => updateField("standard_freight_rate", v)} disabled={isReadOnly} />
                  <CurrencyField label="Discounted Freight Rate" value={form.discounted_freight_rate} onChange={(v) => updateField("discounted_freight_rate", v)} disabled={isReadOnly} />
                  <CurrencyField label="Freight per Machine" value={form.freight_per_machine} onChange={(v) => updateField("freight_per_machine", v)} disabled={isReadOnly} />
                  <ReadOnlyField label="Freight Total" value={`$${currency(computed.freightTotal)}`} />
                  <CurrencyField label="Storage Fee / Month" value={form.storage_fee_per_machine_month} onChange={(v) => updateField("storage_fee_per_machine_month", v)} disabled={isReadOnly} />
                  <InputField label="Free Storage Months" type="number" value={form.free_storage_months} onChange={(v) => updateField("free_storage_months", v)} disabled={isReadOnly} min="0" />
                </div>
                <div className="mt-4">
                  <TextareaField label="Shipping Notes" value={form.shipping_notes} onChange={(v) => updateField("shipping_notes", v)} disabled={isReadOnly} rows={2} />
                </div>
              </>
            )}
          </div>

          {/* Payment Terms */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <DollarSign className="h-4 w-4 text-gray-400" /> Payment Terms
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ReadOnlyField label="Total Due Prior to Procurement" value={`$${currency(computed.totalDue)}`} highlight />
              <InputField label="Payment Due Date" type="date" value={form.payment_due_date} onChange={(v) => updateField("payment_due_date", v)} disabled={isReadOnly} />
            </div>
            <div className="mt-4">
              <TextareaField label="Payment Method Notes" value={form.payment_method_notes} onChange={(v) => updateField("payment_method_notes", v)} disabled={isReadOnly} rows={2} />
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <input
                id="auto-invoice"
                type="checkbox"
                checked={form.auto_send_invoice_on_signing}
                onChange={(e) => updateBool("auto_send_invoice_on_signing", e.target.checked)}
                disabled={isReadOnly}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
              />
              <label htmlFor="auto-invoice" className="flex-1 cursor-pointer">
                <span className="block text-sm font-medium text-gray-900">Auto-send invoice after both parties sign</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  When both parties have signed, automatically create an order and send the invoice to the operator in a separate email.
                  Leave off if you prefer to manually create the order and send the invoice later.
                </span>
              </label>
            </div>
          </div>
          </>
          )}

          {/* Agreement Settings */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Settings className="h-4 w-4 text-gray-400" /> Agreement Settings
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Effective Date" type="date" value={form.effective_date} onChange={(v) => updateField("effective_date", v)} disabled={isReadOnly} />
              <SelectField
                label="Governing State"
                value={form.governing_state}
                onChange={(v) => updateField("governing_state", v)}
                disabled={isReadOnly}
                options={US_STATES.map((s) => ({ value: US_STATE_NAMES[s] || s, label: `${s} - ${US_STATE_NAMES[s] || s}` }))}
              />
              <SelectField
                label="Venue State"
                value={form.venue_state}
                onChange={(v) => updateField("venue_state", v)}
                disabled={isReadOnly}
                options={US_STATES.map((s) => ({ value: US_STATE_NAMES[s] || s, label: `${s} - ${US_STATE_NAMES[s] || s}` }))}
              />
              <InputField label="Contract Expiration Date" type="date" value={form.contract_expiration_date} onChange={(v) => updateField("contract_expiration_date", v)} disabled={isReadOnly} />
            </div>
            <div className="mt-4 space-y-4">
              <TextareaField label="Internal Notes (Admin Only)" value={form.internal_notes} onChange={(v) => updateField("internal_notes", v)} disabled={isReadOnly} rows={3} hint="Only visible to admins and sales reps. Not included in the agreement." />
              <TextareaField label="Customer-Facing Notes" value={form.customer_notes} onChange={(v) => updateField("customer_notes", v)} disabled={isReadOnly} rows={3} hint="Visible to the operator in the agreement." />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Status */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-gray-400" /> Status
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Status</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${AGREEMENT_STATUS_COLORS[agreement.agreement_status] || AGREEMENT_STATUS_COLORS.draft}`}>
                  {formatStatus(agreement.agreement_status)}
                </span>
              </div>
              <StatusDateRow label="Created" date={agreement.created_at} />
              <StatusDateRow label="Sent" date={agreement.sent_at} />
              <StatusDateRow label="Viewed" date={agreement.viewed_at} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Operator Signed</span>
                {agreement.operator_signed_at ? (
                  <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {new Date(agreement.operator_signed_at).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">--</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Apex Signed</span>
                {agreement.apex_signed_at ? (
                  <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {new Date(agreement.apex_signed_at).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">--</span>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4 text-gray-400" /> Agreement Preview
            </h3>
            <p className="text-xs text-gray-500 mb-3">Preview the full rendered agreement with all current form values.</p>
            <button
              onClick={() => setShowPreview(true)}
              className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer inline-flex items-center justify-center gap-2"
            >
              <Eye className="h-4 w-4" /> Preview Full Agreement
            </button>
          </div>

          {/* Signing Link */}
          {agreement.sign_token && ["sent", "viewed", "partially_signed"].includes(agreement.agreement_status) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Send className="h-4 w-4 text-gray-400" /> Signing Link
              </h3>
              <p className="text-xs text-gray-500 mb-2">Share this link with the operator to sign:</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/sign/${agreement.sign_token}`}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 bg-gray-50"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/sign/${agreement.sign_token}`);
                    showToast("Link copied");
                  }}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 cursor-pointer"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Actions</h3>
            <div className="space-y-2">
              {!isReadOnly && (
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </button>
              )}
              {!isReadOnly && (
                <button
                  onClick={handleSend}
                  disabled={sending || dirty}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
                  title={dirty ? "Save changes first" : ""}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send to Operator
                </button>
              )}
              <button
                onClick={handleDownloadPdf}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" /> Download PDF
              </button>
              <button
                onClick={handleCreateOrder}
                disabled={creatingOrder}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {creatingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                {agreement.order_id ? "View Linked Order" : "Create Order from Agreement"}
              </button>
              {agreement.agreement_status === "partially_signed" && (
                <button
                  onClick={() => setShowApexSign(true)}
                  className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Shield className="h-4 w-4" /> Apex Countersign
                </button>
              )}
              {!isCancelled && !isSigned && agreement.agreement_status !== "draft" && (
                <button
                  onClick={handleCancel}
                  className="w-full rounded-lg border border-amber-200 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-50 cursor-pointer inline-flex items-center justify-center gap-2"
                >
                  <Ban className="h-4 w-4" /> Cancel Agreement
                </button>
              )}
              {isDraft && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 cursor-pointer inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Agreement
                </button>
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-gray-400" /> Activity Log
            </h3>
            {agreement.activity.length === 0 ? (
              <p className="text-sm text-gray-400 py-2 text-center">No activity yet.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {agreement.activity.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 leading-relaxed">{a.description || formatStatus(a.activity_type)}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StandaloneAgreementPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>}>
      <StandaloneAgreementEditor />
    </Suspense>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function LocationPlacementSections({
  form,
  updateField,
  updateBool,
  isReadOnly,
}: {
  form: FormData;
  updateField: (field: keyof FormData, value: string) => void;
  updateBool: (field: keyof FormData, value: boolean) => void;
  isReadOnly: boolean;
}) {
  return (
    <>
      {/* Location Contact (Host) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <MapPin className="h-4 w-4 text-gray-400" /> Location / Host Information
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          The location is the recipient — this agreement will be sent to <strong>{form.location_contact_email || "their email"}</strong> for signature.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Business / Location Name" value={form.location_business_name} onChange={(v) => updateField("location_business_name", v)} disabled={isReadOnly} required />
          <InputField label="Contact Name" value={form.location_contact_name} onChange={(v) => updateField("location_contact_name", v)} disabled={isReadOnly} required />
          <InputField label="Contact Email" type="email" value={form.location_contact_email} onChange={(v) => updateField("location_contact_email", v)} disabled={isReadOnly} required />
          <InputField label="Contact Phone" type="tel" value={form.location_contact_phone} onChange={(v) => updateField("location_contact_phone", v)} disabled={isReadOnly} />
          <InputField label="Title / Role" value={form.location_contact_title} onChange={(v) => updateField("location_contact_title", v)} disabled={isReadOnly} />
          <InputField label="Address" value={form.location_address} onChange={(v) => updateField("location_address", v)} disabled={isReadOnly} />
          <InputField label="City" value={form.location_city} onChange={(v) => updateField("location_city", v)} disabled={isReadOnly} />
          <div className="grid grid-cols-2 gap-2">
            <InputField label="State" value={form.location_state} onChange={(v) => updateField("location_state", v)} disabled={isReadOnly} />
            <InputField label="ZIP" value={form.location_zip} onChange={(v) => updateField("location_zip", v)} disabled={isReadOnly} />
          </div>
        </div>
      </div>

      {/* Operator (the vending company placing the machine) */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <Building2 className="h-4 w-4 text-gray-400" /> Operator (Vending Company)
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          The vending operator placing the machine — a fully-signed copy is sent to their email.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Operator Company Name" value={form.placement_operator_company} onChange={(v) => updateField("placement_operator_company", v)} disabled={isReadOnly} required />
          <InputField label="Contact Name" value={form.placement_operator_contact} onChange={(v) => updateField("placement_operator_contact", v)} disabled={isReadOnly} />
          <InputField label="Email" type="email" value={form.placement_operator_email} onChange={(v) => updateField("placement_operator_email", v)} disabled={isReadOnly} required />
          <InputField label="Phone" type="tel" value={form.placement_operator_phone} onChange={(v) => updateField("placement_operator_phone", v)} disabled={isReadOnly} />
        </div>
      </div>

      {/* Placement Terms */}
      <div className={`rounded-xl border bg-white p-5 ${form.include_placement_terms ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-gray-400" /> Placement Terms
          </h3>
          <SectionToggle included={form.include_placement_terms} onChange={(v) => updateBool("include_placement_terms", v)} disabled={isReadOnly} />
        </div>
        {form.include_placement_terms && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Machine Count" type="number" value={form.placement_machine_count} onChange={(v) => updateField("placement_machine_count", v)} disabled={isReadOnly} min="1" />
              <InputField label="Machine Type" value={form.placement_machine_type} onChange={(v) => updateField("placement_machine_type", v)} disabled={isReadOnly} />
              <InputField label="Target Installation Date" type="date" value={form.placement_installation_date} onChange={(v) => updateField("placement_installation_date", v)} disabled={isReadOnly} />
              <InputField label="Term Length (months)" type="number" value={form.placement_term_months} onChange={(v) => updateField("placement_term_months", v)} disabled={isReadOnly} min="0" />
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
              <input
                id="placement-exclusivity"
                type="checkbox"
                checked={form.placement_exclusivity}
                onChange={(e) => updateBool("placement_exclusivity", e.target.checked)}
                disabled={isReadOnly}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
              />
              <label htmlFor="placement-exclusivity" className="flex-1 cursor-pointer">
                <span className="block text-sm font-medium text-gray-900">Exclusive Placement</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Location agrees to host this operator exclusively for the term.
                </span>
              </label>
            </div>
            <div className="mt-4">
              <TextareaField label="Placement Notes" value={form.placement_notes} onChange={(v) => updateField("placement_notes", v)} disabled={isReadOnly} rows={2} />
            </div>
          </>
        )}
      </div>

      {/* Compensation */}
      <div className={`rounded-xl border bg-white p-5 ${form.include_compensation ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-gray-400" /> Compensation
          </h3>
          <SectionToggle included={form.include_compensation} onChange={(v) => updateBool("include_compensation", v)} disabled={isReadOnly} />
        </div>
        {form.include_compensation && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField
                label="Compensation Type"
                value={form.commission_type}
                onChange={(v) => updateField("commission_type", v)}
                disabled={isReadOnly}
                options={[
                  { value: "revenue_share", label: "Revenue Share (%)" },
                  { value: "flat_monthly", label: "Flat Monthly Payment" },
                  { value: "none", label: "No Compensation" },
                ]}
              />
              <SelectField
                label="Payout Schedule"
                value={form.commission_payout_schedule}
                onChange={(v) => updateField("commission_payout_schedule", v)}
                disabled={isReadOnly}
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "annual", label: "Annual" },
                ]}
              />
              {form.commission_type === "revenue_share" && (
                <InputField label="Revenue Share %" type="number" value={form.commission_pct} onChange={(v) => updateField("commission_pct", v)} disabled={isReadOnly} min="0" />
              )}
              {form.commission_type === "flat_monthly" && (
                <CurrencyField label="Monthly Payment" value={form.commission_monthly_fee} onChange={(v) => updateField("commission_monthly_fee", v)} disabled={isReadOnly} />
              )}
            </div>
            <div className="mt-4">
              <TextareaField label="Compensation Notes" value={form.commission_notes} onChange={(v) => updateField("commission_notes", v)} disabled={isReadOnly} rows={2} />
            </div>
          </>
        )}
      </div>

      {/* Duration & Termination */}
      <div className={`rounded-xl border bg-white p-5 ${form.include_duration_termination ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" /> Duration & Termination
          </h3>
          <SectionToggle included={form.include_duration_termination} onChange={(v) => updateBool("include_duration_termination", v)} disabled={isReadOnly} />
        </div>
        {form.include_duration_termination && (
          <p className="text-xs text-gray-500">
            Standard duration & termination language is included. The Term Length set in Placement Terms ({form.placement_term_months || "—"} months) governs the contract length, with 30-day written notice required for early termination.
          </p>
        )}
      </div>

      {/* Responsibilities */}
      <div className={`rounded-xl border bg-white p-5 ${form.include_responsibilities ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="h-4 w-4 text-gray-400" /> Responsibilities
          </h3>
          <SectionToggle included={form.include_responsibilities} onChange={(v) => updateBool("include_responsibilities", v)} disabled={isReadOnly} />
        </div>
        {form.include_responsibilities && (
          <p className="text-xs text-gray-500">
            Standard responsibility language is included. The Operator handles installation, maintenance, stocking, and removal; the Location provides electrical access and reasonable host cooperation.
          </p>
        )}
      </div>

      {/* Sales Rep */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <UserPlus className="h-4 w-4 text-gray-400" /> Sales Rep
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          The rep handling this deal — auto-populated from your account; receives a copy of the fully signed agreement.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField label="Rep Name" value={form.rep_name} onChange={(v) => updateField("rep_name", v)} disabled={isReadOnly} />
          <InputField label="Rep Email" type="email" value={form.rep_email} onChange={(v) => updateField("rep_email", v)} disabled={isReadOnly} />
        </div>
      </div>
    </>
  );
}

function InputField({ label, value, onChange, type = "text", disabled = false, required = false, min }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean; required?: boolean; min?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} min={min}
        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30 disabled:bg-gray-50 disabled:text-gray-500" />
    </div>
  );
}

function CurrencyField({ label, value, onChange, disabled = false }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} min="0" step="0.01"
          className="w-full rounded-xl border border-gray-200 pl-7 pr-4 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30 disabled:bg-gray-50 disabled:text-gray-500" />
      </div>
    </div>
  );
}

function SectionToggle({ included, onChange, disabled = false }: { included: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
      <button
        type="button"
        onClick={() => !disabled && onChange(true)}
        disabled={disabled}
        className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
          included
            ? "bg-green-600 text-white shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        Included
      </button>
      <button
        type="button"
        onClick={() => !disabled && onChange(false)}
        disabled={disabled}
        className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
          !included
            ? "bg-gray-600 text-white shadow-sm"
            : "text-gray-500 hover:text-gray-700"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        Excluded
      </button>
    </div>
  );
}

function ReadOnlyField({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium ${highlight ? "border-green-200 bg-green-50 text-green-700" : "border-gray-100 bg-gray-50 text-gray-700"}`}>
        {value}
      </div>
    </div>
  );
}

function TextareaField({ label, value, onChange, disabled = false, rows = 3, hint }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {hint && <p className="text-[10px] text-gray-400 mb-1">{hint}</p>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={rows}
        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30 disabled:bg-gray-50 disabled:text-gray-500 resize-none" />
    </div>
  );
}

function SelectField({ label, value, onChange, disabled = false, options }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30 disabled:bg-gray-50 disabled:text-gray-500">
        <option value="">Select...</option>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

function StatusDateRow({ label, date }: { label: string; date: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-700">
        {date ? new Date(date).toLocaleDateString() : <span className="text-gray-400">--</span>}
      </span>
    </div>
  );
}

// ===========================================================================
// Agreement Preview Modal
// ===========================================================================

function AgreementPreviewModal({ form, computed, agreement, onClose }: {
  form: FormData;
  computed: { equipmentSubtotal: number; freightTotal: number; maxLocationServiceValue: number; locationUpfront: number; locationRemaining: number; totalDue: number };
  agreement: Agreement;
  onClose: () => void;
}) {
  const companyName = form.operator_company_name || "[Operator Company Name]";
  const legalName = form.operator_legal_name || "[Operator Legal Name]";
  const email = form.operator_email || "[Operator Email]";
  const phone = form.operator_phone || "[Operator Phone]";
  const billingAddr = form.operator_billing_address || "[Billing Address]";
  const deliveryAddr = form.operator_delivery_address || "[Delivery Address]";
  const title = form.operator_title || "[Title]";
  const machineModel = form.machine_model || "VendEra AI Smart Vending Machine";
  const qty = Number(form.machine_quantity) || 1;
  const unitPrice = Number(form.machine_unit_price) || 0;
  const locPurchased = Number(form.locations_purchased) || 0;
  const locFee = Number(form.location_fee_per_secured) || 0;
  const timelineDays = Number(form.location_service_timeline_days) || 180;
  const rejectionAllowance = form.location_rejection_allowance || "Greater of 10 locations total or 1 per purchased machine";
  const locPaymentTerms = form.location_payment_terms || "Due within 5 business days of invoice";
  const stdFreight = Number(form.standard_freight_rate) || 0;
  const discFreight = Number(form.discounted_freight_rate) || 0;
  const freightPer = Number(form.freight_per_machine) || 0;
  const storageFee = Number(form.storage_fee_per_machine_month) || 0;
  const freeStorageMonths = Number(form.free_storage_months) || 0;
  const effectiveDate = form.effective_date ? new Date(form.effective_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Effective Date]";
  const governingState = form.governing_state || "Texas";
  const venueState = form.venue_state || "Texas";
  const paymentDueDate = form.payment_due_date ? new Date(form.payment_due_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Payment Due Date]";
  const expirationDate = form.contract_expiration_date ? new Date(form.contract_expiration_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "[Expiration Date]";
  const customerNotes = form.customer_notes || "";
  const apexRepName = agreement.apex_representative_name || "[Apex Representative]";
  const apexRepTitle = agreement.apex_representative_title || "Representative";
  const apexRepEmail = agreement.apex_representative_email || "[Apex Email]";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl my-4">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-gray-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Agreement Preview</h2>
            <p className="text-xs text-gray-500">Full rendered agreement with current form values</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-8 py-6 prose prose-sm max-w-none text-gray-800 leading-relaxed">
          <div className="text-center mb-8">
            <h1 className="text-xl font-bold text-gray-900 mb-1">VENDERA AI MACHINE PURCHASE &amp; SERVICES AGREEMENT</h1>
            <p className="text-sm text-gray-500">Apex AI Vending LLC</p>
          </div>

          <p>This VendEra AI Machine Purchase &amp; Services Agreement (this &ldquo;Agreement&rdquo;) is entered into as of <strong>{effectiveDate}</strong> (the &ldquo;Effective Date&rdquo;), by and between:</p>
          <p><strong>Apex AI Vending LLC</strong>, a Texas limited liability company (&ldquo;Apex&rdquo; or &ldquo;Company&rdquo;), and</p>
          <p><strong>{companyName}</strong>, with its principal office at {billingAddr} (&ldquo;Operator&rdquo; or &ldquo;Buyer&rdquo;).</p>
          <p className="text-xs text-gray-500 italic">Operator Contact: {legalName}, {title} | Email: {email} | Phone: {phone}</p>

          {form.include_equipment && (
            <>
              <hr className="my-4" />
              <h2 className="text-base font-bold text-gray-900 mt-6 mb-2">SCHEDULE A &mdash; EQUIPMENT PURCHASE</h2>
              <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="text-left px-4 py-2 font-medium text-gray-600">Item</th><th className="text-center px-4 py-2 font-medium text-gray-600">Qty</th><th className="text-right px-4 py-2 font-medium text-gray-600">Unit Price</th><th className="text-right px-4 py-2 font-medium text-gray-600">Subtotal</th></tr></thead>
                  <tbody><tr className="border-t border-gray-100"><td className="px-4 py-2">{machineModel}</td><td className="px-4 py-2 text-center">{qty}</td><td className="px-4 py-2 text-right">${currency(unitPrice)}</td><td className="px-4 py-2 text-right font-medium">${currency(computed.equipmentSubtotal)}</td></tr></tbody>
                </table>
              </div>

              <p><strong>1. Equipment Purchase.</strong> Apex agrees to sell and Operator agrees to purchase {qty} {machineModel} machine{qty > 1 ? "s" : ""} (the &ldquo;Equipment&rdquo;) at a per-unit price of ${currency(unitPrice)}, for a total equipment cost of <strong>${currency(computed.equipmentSubtotal)}</strong>.</p>
              <p><strong>2. Machine Specifications.</strong> Each VendEra AI Smart Vending Machine includes: AI-powered product recognition, touchscreen display, cashless payment system, remote monitoring capabilities, cloud-based inventory management, and temperature control system.</p>
              <p><strong>3. Warranty.</strong> Each machine is covered by a standard manufacturer&rsquo;s warranty of twelve (12) months from the date of delivery.</p>
              <p className="text-center text-xs text-gray-500 italic my-4">[Operator Initials: ___]</p>
            </>
          )}

          {form.include_location_services && locPurchased > 0 && (
            <>
              <hr className="my-4" />
              <h2 className="text-base font-bold text-gray-900 mt-6 mb-2">SCHEDULE B &mdash; LOCATION SERVICES</h2>
              <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="text-left px-4 py-2 font-medium text-gray-600">Service</th><th className="text-center px-4 py-2 font-medium text-gray-600">Locations</th><th className="text-right px-4 py-2 font-medium text-gray-600">Fee / Location</th><th className="text-right px-4 py-2 font-medium text-gray-600">Max Value</th></tr></thead>
                  <tbody><tr className="border-t border-gray-100"><td className="px-4 py-2">Location Sourcing &amp; Placement</td><td className="px-4 py-2 text-center">{locPurchased}</td><td className="px-4 py-2 text-right">${currency(locFee)}</td><td className="px-4 py-2 text-right font-medium">${currency(computed.maxLocationServiceValue)}</td></tr></tbody>
                </table>
              </div>
              <p><strong>4. Location Services.</strong> Apex will source and secure {locPurchased} vending location{locPurchased > 1 ? "s" : ""} at ${currency(locFee)} per secured location, max <strong>${currency(computed.maxLocationServiceValue)}</strong>.</p>
              <p><strong>5. Service Timeline.</strong> Apex shall use commercially reasonable efforts to secure locations within {timelineDays} days.</p>
              <p><strong>6. Rejection Allowance.</strong> {rejectionAllowance}.</p>
              {form.location_services_deposit_only ? (
                <p><strong>7. Location Service Payment.</strong> A non-refundable deposit of <strong>${currency(computed.locationUpfront)}</strong> is due prior to procurement. The remaining balance of <strong>${currency(computed.locationRemaining)}</strong> shall be invoiced upon fulfillment of secured locations and is due on receipt.</p>
              ) : (
                <p><strong>7. Location Service Payment.</strong> {locPaymentTerms}.</p>
              )}
              <p className="text-center text-xs text-gray-500 italic my-4">[Operator Initials: ___]</p>
            </>
          )}

          {form.include_shipping_storage && (
            <>
              <hr className="my-4" />
              <h2 className="text-base font-bold text-gray-900 mt-6 mb-2">SCHEDULE C &mdash; SHIPPING &amp; STORAGE</h2>
              <div className="rounded-lg border border-gray-200 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="text-left px-4 py-2 font-medium text-gray-600">Item</th><th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th></tr></thead>
                  <tbody>
                    {stdFreight > 0 && (<tr className="border-t border-gray-100"><td className="px-4 py-2">Standard Freight Rate</td><td className="px-4 py-2 text-right">${currency(stdFreight)} / machine</td></tr>)}
                    {discFreight > 0 && (<tr className="border-t border-gray-100"><td className="px-4 py-2">Discounted Freight Rate</td><td className="px-4 py-2 text-right">${currency(discFreight)} / machine</td></tr>)}
                    <tr className="border-t border-gray-100"><td className="px-4 py-2">Freight per Machine</td><td className="px-4 py-2 text-right">${currency(freightPer)}</td></tr>
                    <tr className="border-t border-gray-100 font-medium"><td className="px-4 py-2">Freight Total ({qty} machine{qty > 1 ? "s" : ""})</td><td className="px-4 py-2 text-right">${currency(computed.freightTotal)}</td></tr>
                    {storageFee > 0 && (<tr className="border-t border-gray-100"><td className="px-4 py-2">Storage Fee</td><td className="px-4 py-2 text-right">${currency(storageFee)} / machine / month</td></tr>)}
                    <tr className="border-t border-gray-100"><td className="px-4 py-2">Free Storage Period</td><td className="px-4 py-2 text-right">{freeStorageMonths} month{freeStorageMonths !== 1 ? "s" : ""}</td></tr>
                  </tbody>
                </table>
              </div>
              <p><strong>8. Shipping.</strong> Freight is ${currency(freightPer)} per machine for a total of <strong>${currency(computed.freightTotal)}</strong>. Delivery: {deliveryAddr || "[Delivery Address]"}.</p>
              <p><strong>9. Storage.</strong> {freeStorageMonths} month{freeStorageMonths !== 1 ? "s" : ""} free storage. After that, ${currency(storageFee)} per machine per month.</p>
              <p className="text-center text-xs text-gray-500 italic my-4">[Operator Initials: ___]</p>
            </>
          )}

          <hr className="my-4" />
          <h2 className="text-base font-bold text-gray-900 mt-6 mb-2">PAYMENT SUMMARY</h2>
          <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4 mb-4">
            <div className="space-y-2 text-sm">
              {form.include_equipment && computed.equipmentSubtotal > 0 && (
                <div className="flex justify-between"><span>Equipment ({qty}x {machineModel})</span><span className="font-medium">${currency(computed.equipmentSubtotal)}</span></div>
              )}
              {form.include_location_services && computed.locationUpfront > 0 && (
                <div className="flex justify-between">
                  <span>
                    {form.location_services_deposit_only
                      ? `Location Services Deposit (${locPurchased} location${locPurchased > 1 ? "s" : ""})`
                      : `Location Services (${locPurchased} location${locPurchased > 1 ? "s" : ""})`}
                  </span>
                  <span className="font-medium">${currency(computed.locationUpfront)}</span>
                </div>
              )}
              {form.include_shipping_storage && computed.freightTotal > 0 && (
                <div className="flex justify-between"><span>Shipping &amp; Freight</span><span className="font-medium">${currency(computed.freightTotal)}</span></div>
              )}
              <div className="border-t border-green-200 pt-2 flex justify-between text-base font-bold text-green-800"><span>Total Due Prior to Procurement</span><span>${currency(computed.totalDue)}</span></div>
              {form.location_services_deposit_only && computed.locationRemaining > 0 && (
                <div className="text-xs text-gray-600 italic mt-1">
                  + ${currency(computed.locationRemaining)} Location Services balance due upon fulfillment
                </div>
              )}
            </div>
          </div>
          <p><strong>10. Payment Due Date.</strong> Full payment of <strong>${currency(computed.totalDue)}</strong> is due on or before <strong>{paymentDueDate}</strong>.</p>
          <p><strong>11. Payment Method.</strong> {form.payment_method_notes || "Payment may be made via wire transfer, ACH, certified check, or other method approved by Apex."}</p>
          <p className="text-center text-xs text-gray-500 italic my-4">[Operator Initials: ___]</p>

          <hr className="my-4" />
          <h2 className="text-base font-bold text-gray-900 mt-6 mb-2">GENERAL TERMS &amp; CONDITIONS</h2>
          <p><strong>12. Ownership &amp; Title.</strong> Title passes upon receipt of full payment. Risk of loss transfers upon delivery.</p>
          <p><strong>13. Installation &amp; Setup.</strong> Operator is responsible for installation. Apex provides remote setup assistance.</p>
          <p><strong>14. Returns &amp; Cancellations.</strong> Orders may be cancelled prior to procurement. After ordering, up to 15% restocking fee.</p>
          <p><strong>15. Limitation of Liability.</strong> Apex&rsquo;s total liability shall not exceed total amount paid. No indirect/consequential damages.</p>
          <p><strong>16. Indemnification.</strong> Operator indemnifies Apex from claims arising from use of Equipment.</p>
          <p><strong>17. Force Majeure.</strong> Neither party liable for delays beyond reasonable control.</p>
          <p><strong>18. Confidentiality.</strong> Both parties maintain confidentiality of pricing and business terms.</p>
          <p><strong>19. Intellectual Property.</strong> All embedded IP remains Apex&rsquo;s property. Non-exclusive license granted to Operator.</p>
          <p><strong>20. Compliance.</strong> Operator shall comply with all applicable laws.</p>
          <p><strong>21. Non-Solicitation.</strong> 12-month non-solicitation of employees/contractors.</p>
          <p><strong>22. Assignment.</strong> No assignment without prior written consent of Apex.</p>
          <p><strong>23. Amendment.</strong> Written instrument signed by both parties required.</p>
          <p><strong>24. Severability.</strong> Invalid provisions do not affect remaining provisions.</p>
          <p><strong>25. Waiver.</strong> Failure to enforce does not constitute waiver.</p>
          <p><strong>26. Notices.</strong> Written notices to specified addresses.</p>
          <p><strong>27. Entire Agreement.</strong> This Agreement constitutes the entire agreement.</p>
          <p><strong>28. Governing Law.</strong> Governed by laws of {governingState}.</p>
          <p><strong>29. Dispute Resolution.</strong> Binding arbitration in {venueState}.</p>
          <p><strong>30. Term &amp; Expiration.</strong> Effective as of {effectiveDate}, remains in effect until obligations fulfilled or {expirationDate}.</p>
          <p><strong>31. Electronic Signatures.</strong> Electronic signatures deemed original.</p>
          {customerNotes && (<><hr className="my-4" /><h2 className="text-base font-bold text-gray-900 mt-6 mb-2">ADDITIONAL NOTES</h2><p>{customerNotes}</p></>)}
          <p className="text-center text-xs text-gray-500 italic my-4">[Operator Initials: ___]</p>

          <hr className="my-4" />
          <h2 className="text-base font-bold text-gray-900 mt-6 mb-2">SIGNATURES</h2>
          <p>IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.</p>
          <div className="grid grid-cols-2 gap-8 mt-6 mb-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-4">Apex AI Vending LLC</p>
              <div className="border-b border-gray-300 mb-2 h-10" />
              <p className="text-sm">Name: {apexRepName}</p>
              <p className="text-sm">Title: {apexRepTitle}</p>
              <p className="text-sm">Email: {apexRepEmail}</p>
              <p className="text-sm mt-2">Date: _______________</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-4">Operator / Buyer</p>
              <div className="border-b border-gray-300 mb-2 h-10" />
              <p className="text-sm">Name: {legalName}</p>
              <p className="text-sm">Title: {title}</p>
              <p className="text-sm">Company: {companyName}</p>
              <p className="text-sm">Email: {email}</p>
              <p className="text-sm mt-2">Date: _______________</p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-white px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Close Preview</button>
        </div>
      </div>
    </div>
  );
}
