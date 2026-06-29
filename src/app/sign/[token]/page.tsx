"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  FileText,
  PenTool,
  Download,
  AlertCircle,
  Check,
  X,
  RotateCcw,
} from "lucide-react";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface AgreementInitial {
  id: string;
  section_key: string;
  signer_type: string;
  initials_data: string;
  initialed_at: string;
}

interface AgreementSignature {
  id: string;
  signer_type: string;
  signer_name: string;
  signer_company: string | null;
  signer_title: string | null;
  signature_data: string;
  signature_type: string;
  signed_at: string;
}

interface PurchaseAgreement {
  id: string;
  agreement_status: string;
  agreement_type: string;
  template_version: number;

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

  include_equipment?: boolean;
  include_location_services?: boolean;
  include_shipping_storage?: boolean;
  location_services_deposit_only?: boolean;
  location_services_deposit_amount?: number;

  effective_date: string | null;
  governing_state: string | null;
  venue_state: string | null;
  contract_expiration_date: string | null;
  customer_notes: string | null;

  pdf_url: string | null;
  signed_pdf_url: string | null;

  sent_at: string | null;
  viewed_at: string | null;
  operator_signed_at: string | null;
  apex_signed_at: string | null;
  created_at: string;
  updated_at: string;

  initials: AgreementInitial[];
  signatures: AgreementSignature[];
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function getRequiredInitials(agreement: PurchaseAgreement | null): string[] {
  if (!agreement) return [];
  const includeEq = agreement.include_equipment !== false;
  const includeLoc = agreement.include_location_services !== false;
  const includeShip = agreement.include_shipping_storage !== false;
  const keys: string[] = [];
  if (includeEq) keys.push("section_3");
  if (includeShip) keys.push("section_4");
  if (includeLoc) keys.push("section_5");
  keys.push("section_6"); // Payment Terms always required
  if (includeLoc) keys.push("section_7");
  if (includeShip) keys.push("section_8");
  if (includeEq) keys.push("schedule_a");
  if (includeLoc) keys.push("schedule_b");
  if (includeShip) keys.push("schedule_c");
  return keys;
}

function currency(val: number | null | undefined): string {
  if (val == null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(val));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "_______________";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function todayFormatted(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/* ================================================================== */
/*  Initials Input Component                                           */
/* ================================================================== */

function InitialsField({
  sectionKey,
  token,
  existingInitial,
  onInitialed,
}: {
  sectionKey: string;
  token: string;
  existingInitial?: AgreementInitial;
  onInitialed: (sectionKey: string, data: AgreementInitial) => void;
}) {
  const [value, setValue] = useState(existingInitial?.initials_data || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!existingInitial);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 4) {
      setError("Initials must be 2-4 characters");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agreements/sign/${token}/initials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_key: sectionKey,
          initials_data: trimmed,
        }),
      });
      if (res.ok) {
        setSaved(true);
        onInitialed(sectionKey, {
          id: "",
          section_key: sectionKey,
          signer_type: "operator",
          initials_data: trimmed,
          initialed_at: new Date().toISOString(),
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to save initials");
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  if (saved) {
    return (
      <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
        <Check className="h-4 w-4 text-green-600" />
        <span className="text-sm font-semibold text-green-800 font-serif italic">
          {value || existingInitial?.initials_data}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        Initials:
      </label>
      <input
        type="text"
        maxLength={4}
        placeholder="e.g. JD"
        value={value}
        onChange={(e) => {
          setValue(e.target.value.toUpperCase());
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        onBlur={() => {
          if (value.trim().length >= 2) save();
        }}
        className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-center text-sm font-semibold uppercase tracking-wider focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
      />
      <button
        onClick={save}
        disabled={saving || value.trim().length < 2}
        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          "Confirm"
        )}
      </button>
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Signature Canvas Component                                         */
/* ================================================================== */

function SignatureCanvas({
  onSignature,
}: {
  onSignature: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e) {
        const touch = e.touches[0];
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawingRef.current = true;
      lastPosRef.current = getPos(e);
    },
    [getPos],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawingRef.current || !lastPosRef.current) return;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      lastPosRef.current = pos;
    },
    [getPos],
  );

  const stopDrawing = useCallback(() => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastPosRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) onSignature(canvas.toDataURL("image/png"));
    }
  }, [onSignature]);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSignature("");
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(1, 1);
  }, []);

  return (
    <div>
      <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          className="w-full h-40 cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <div className="absolute bottom-2 left-3 right-3 border-t border-gray-200" />
        <p className="absolute bottom-3 left-3 text-[10px] text-gray-300 pointer-events-none">
          Sign above the line
        </p>
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
      >
        <RotateCcw className="h-3 w-3" /> Clear
      </button>
    </div>
  );
}

/* ================================================================== */
/*  Main Page Content                                                  */
/* ================================================================== */

function SigningContent() {
  const { token } = useParams<{ token: string }>();
  const [agreement, setAgreement] = useState<PurchaseAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initials tracking
  const [initialsMap, setInitialsMap] = useState<
    Record<string, AgreementInitial>
  >({});

  // Signature state
  const [signatureMode, setSignatureMode] = useState<"type" | "draw">("type");
  const [typedSignature, setTypedSignature] = useState("");
  const [drawnSignature, setDrawnSignature] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerCompany, setSignerCompany] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signSuccess, setSignSuccess] = useState(false);

  /* ---------- Load agreement ---------- */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/agreements/sign/${token}`);
        if (res.ok) {
          const data: PurchaseAgreement = await res.json();
          setAgreement(data);

          // Build initials map
          const map: Record<string, AgreementInitial> = {};
          for (const init of data.initials || []) {
            if (init.signer_type === "operator") {
              map[init.section_key] = init;
            }
          }
          setInitialsMap(map);

          // Pre-fill signer info
          setSignerName(data.operator_legal_name || "");
          setSignerCompany(data.operator_company_name || "");
          setSignerTitle(data.operator_title || "");

          // If already signed
          if (data.agreement_status === "signed") {
            setSignSuccess(true);
          }
        } else {
          const data = await res.json().catch(() => ({}));
          setError(
            data.error || "Agreement not found or expired",
          );
        }
      } catch {
        setError("Failed to load agreement. Please try again.");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  /* ---------- Handle initial ---------- */
  function handleInitialed(sectionKey: string, data: AgreementInitial) {
    setInitialsMap((prev) => ({ ...prev, [sectionKey]: data }));
  }

  /* ---------- Handle signature ---------- */
  async function handleSign() {
    const sigData =
      signatureMode === "type" ? typedSignature.trim() : drawnSignature;
    if (!signerName.trim()) {
      setSignError("Please enter your full name");
      return;
    }
    if (!sigData) {
      setSignError(
        signatureMode === "type"
          ? "Please type your signature"
          : "Please draw your signature",
      );
      return;
    }
    setSigning(true);
    setSignError(null);
    try {
      const res = await fetch(`/api/agreements/sign/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signer_name: signerName.trim(),
          signer_company: signerCompany.trim(),
          signer_title: signerTitle.trim(),
          signature_data: sigData,
          signature_type: signatureMode === "type" ? "typed" : "drawn",
        }),
      });
      if (res.ok) {
        setSignSuccess(true);
        setAgreement((a) =>
          a
            ? {
                ...a,
                agreement_status: "signed",
                operator_signed_at: new Date().toISOString(),
              }
            : a,
        );
      } else {
        const data = await res.json().catch(() => ({}));
        setSignError(data.error || "Failed to sign agreement");
      }
    } catch {
      setSignError("Network error. Please try again.");
    }
    setSigning(false);
  }

  const requiredInitials = getRequiredInitials(agreement);
  const allInitialsComplete = requiredInitials.every(
    (key) => initialsMap[key],
  );

  const isSigned =
    signSuccess ||
    agreement?.agreement_status === "signed" ||
    !!agreement?.operator_signed_at;

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-green-600 mb-3" />
          <p className="text-sm text-gray-500">Loading agreement...</p>
        </div>
      </div>
    );
  }

  /* ---------- Error ---------- */
  if (error || !agreement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Agreement Not Found
          </h1>
          <p className="text-sm text-gray-500">
            {error || "This agreement could not be found or has expired."}
          </p>
        </div>
      </div>
    );
  }

  /* ---------- Already Fully Signed ---------- */
  if (isSigned) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="mx-auto max-w-lg text-center">
          <div className="rounded-2xl border border-green-200 bg-white shadow-sm p-8">
            <CheckCircle2 className="mx-auto h-16 w-16 text-green-600 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Agreement Signed Successfully
            </h1>
            <p className="text-gray-600 mb-1">
              The VendEra AI Machine Purchase &amp; Services Agreement has been
              signed.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Signed on{" "}
              {formatDate(
                agreement.operator_signed_at || new Date().toISOString(),
              )}
            </p>

            <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-6 text-left">
              <p className="text-xs font-medium text-green-700 uppercase tracking-wider mb-2">
                Agreement Details
              </p>
              {agreement.include_equipment !== false && (
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">
                    {agreement.machine_quantity}x {agreement.machine_model}
                  </span>
                </p>
              )}
              <p className="text-sm text-gray-700">
                Operator: {agreement.operator_company_name}
              </p>
              <p className="text-sm text-gray-700">
                Total Due: {currency(agreement.total_due_prior_to_procurement)}
              </p>
            </div>

            {agreement.signed_pdf_url && (
              <a
                href={agreement.signed_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download Signed Agreement PDF
              </a>
            )}

            {!agreement.signed_pdf_url && agreement.pdf_url && (
              <a
                href={agreement.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download Agreement PDF
              </a>
            )}

            <p className="text-xs text-gray-400 mt-6">
              A copy of this agreement has been sent to your email.
            </p>
          </div>

          <p className="mt-6 text-xs text-gray-400">
            Apex AI Vending &bull; vendingconnector.com
          </p>
        </div>
      </div>
    );
  }

  /* ---------- Agreement variables ---------- */
  const v = {
    operator: agreement.operator_company_name || "_______________",
    operatorLegal: agreement.operator_legal_name || "_______________",
    operatorTitle: agreement.operator_title || "Authorized Representative",
    apex: agreement.apex_company_name || "Apex AI Vending LLC",
    apexRep: agreement.apex_representative_name || "_______________",
    apexRepTitle:
      agreement.apex_representative_title || "Authorized Representative",
    model: agreement.machine_model || "VendEra AI Smart Vending Machine",
    qty: agreement.machine_quantity || 0,
    unitPrice: currency(agreement.machine_unit_price),
    subtotal: currency(agreement.equipment_subtotal),
    stdFreight: currency(agreement.standard_freight_rate),
    freightPerMachine: currency(agreement.freight_per_machine),
    freightTotal: currency(agreement.freight_total),
    locations: agreement.locations_purchased || 0,
    locationFee: currency(agreement.location_fee_per_secured),
    maxLocationValue: currency(agreement.max_location_service_value),
    locationTimeline: agreement.location_service_timeline_days || 180,
    locationPayTerms:
      agreement.location_payment_terms ||
      "Due within 5 business days of invoice",
    locationRejection:
      agreement.location_rejection_allowance ||
      "Greater of 10 locations total or 1 per purchased machine",
    storageFee: currency(agreement.storage_fee_per_machine_month),
    freeStorageMonths: agreement.free_storage_months || 12,
    totalDue: currency(agreement.total_due_prior_to_procurement),
    effectiveDate: formatDate(agreement.effective_date),
    governingState: agreement.governing_state || "Texas",
    venueState: agreement.venue_state || "Texas",
    discountedFreight: currency(agreement.discounted_freight_rate),
  };

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <div className="mx-auto max-w-4xl py-8 px-4 sm:px-6 lg:px-8">
        {/* ==================== HEADER ==================== */}
        <div className="mb-8 text-center print:mb-4">
          <div className="inline-block rounded-lg bg-green-600 px-4 py-1 mb-3">
            <span className="text-sm font-bold text-white tracking-wider uppercase">
              Apex AI Vending
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
            VendEra AI Machine Purchase &amp; Services Agreement
          </h1>
          <p className="text-sm text-gray-500">
            Effective Date: {v.effectiveDate}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm p-4 print:hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Signing Progress
            </span>
            <span className="text-sm text-gray-500">
              {requiredInitials.filter((k) => initialsMap[k]).length} of{" "}
              {requiredInitials.length} sections initialed
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-green-500 transition-all duration-500"
              style={{
                width: `${(requiredInitials.filter((k) => initialsMap[k]).length / Math.max(1, requiredInitials.length)) * 100}%`,
              }}
            />
          </div>
          {!allInitialsComplete && (
            <p className="mt-2 text-xs text-gray-400">
              Please read and initial each required section before signing.
            </p>
          )}
          {allInitialsComplete && (
            <p className="mt-2 text-xs text-green-600 font-medium">
              All sections initialed. Scroll to the bottom to sign.
            </p>
          )}
        </div>

        {/* ==================== AGREEMENT BODY ==================== */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 sm:px-10 py-8 space-y-8 text-base leading-relaxed text-gray-700">
            {/* ---- Preamble ---- */}
            <div>
              <p>
                This Machine Purchase &amp; Services Agreement (the
                &quot;Agreement&quot;) is entered into as of{" "}
                <strong>{v.effectiveDate}</strong> (the &quot;Effective
                Date&quot;), by and between:
              </p>
              <div className="mt-4 space-y-3 pl-4 border-l-2 border-green-200">
                <p>
                  <strong>{v.apex}</strong>, a Texas limited liability company
                  (&quot;Seller&quot; or &quot;Company&quot;), and
                </p>
                <p>
                  <strong>{v.operator}</strong>{" "}
                  (&quot;Buyer&quot; or &quot;Operator&quot;), represented by{" "}
                  <strong>{v.operatorLegal}</strong>.
                </p>
              </div>
              <p className="mt-4">
                Collectively referred to as the &quot;Parties&quot; and
                individually as a &quot;Party.&quot;
              </p>
            </div>

            {/* ============ SECTION 1 ============ */}
            <SectionHeader num={1} title="Recitals" />
            <div>
              <p>
                WHEREAS, Seller is in the business of selling smart vending
                machines and providing location placement, shipping, logistics,
                and storage services;
              </p>
              {agreement.include_equipment !== false && agreement.include_location_services !== false && (
                <p className="mt-3">
                  WHEREAS, Buyer desires to purchase one or more vending machines
                  and engage Seller for location placement services;
                </p>
              )}
              {agreement.include_equipment !== false && agreement.include_location_services === false && (
                <p className="mt-3">
                  WHEREAS, Buyer desires to purchase one or more vending machines
                  from Seller;
                </p>
              )}
              {agreement.include_equipment === false && agreement.include_location_services !== false && (
                <p className="mt-3">
                  WHEREAS, Buyer desires to engage Seller to provide location
                  placement services for vending machines;
                </p>
              )}
              <p className="mt-3">
                NOW, THEREFORE, in consideration of the mutual covenants and
                agreements set forth herein, and for other good and valuable
                consideration, the receipt and sufficiency of which are hereby
                acknowledged, the Parties agree as follows:
              </p>
            </div>

            {/* ============ SECTION 2 ============ */}
            <SectionHeader num={2} title="Definitions" />
            <div className="space-y-2">
              {agreement.include_equipment !== false && (
                <p>
                  <strong>&quot;Equipment&quot;</strong> means the{" "}
                  {v.model} vending machine(s) specified in Schedule A.
                </p>
              )}
              {agreement.include_location_services !== false && (
                <>
                  <p>
                    <strong>&quot;Location Services&quot;</strong> means the
                    services provided by Seller to identify, vet, and secure
                    suitable vending machine placement locations on behalf of Buyer,
                    as further described in Section 5 and Schedule B.
                  </p>
                  <p>
                    <strong>&quot;Secured Location&quot;</strong> means a location
                    that has been identified, vetted, contacted, and confirmed by
                    Seller as having agreed to host Buyer&apos;s vending machine(s),
                    and for which Seller provides written confirmation to Buyer.
                  </p>
                </>
              )}
              {agreement.include_shipping_storage !== false && (
                <p>
                  <strong>&quot;Storage Program&quot;</strong> means Seller&apos;s
                  optional warehousing and storage services for Equipment prior to
                  deployment, as further described in Section 8 and Schedule C.
                </p>
              )}
              {agreement.include_equipment !== false && (
                <>
                  <p>
                    <strong>&quot;Procurement&quot;</strong> means the process of
                    ordering, manufacturing, and preparing Equipment for shipment to
                    Buyer or Seller&apos;s warehouse facility.
                  </p>
                  <p>
                    <strong>&quot;Delivery&quot;</strong> means the physical transfer
                    of Equipment to Buyer&apos;s designated delivery address or
                    Seller&apos;s storage facility.
                  </p>
                </>
              )}
              <p>
                <strong>&quot;Business Day&quot;</strong> means any day other
                than a Saturday, Sunday, or federal holiday observed in the
                United States.
              </p>
            </div>

            {/* ============ SECTION 3: Equipment Purchase ============ */}
            {agreement.include_equipment !== false && (<>
            <SectionHeader num={3} title="Equipment Purchase" requiresInitials />
            <div>
              <p>
                <strong>3.1 Equipment Description.</strong> Seller agrees to
                sell, and Buyer agrees to purchase, the following equipment:
              </p>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Model
                    </p>
                    <p className="font-semibold text-gray-900">{v.model}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </p>
                    <p className="font-semibold text-gray-900">{v.qty}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit Price
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.unitPrice}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">
                      Equipment Subtotal
                    </span>
                    <span className="font-bold text-gray-900">
                      {v.subtotal}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-4">
                <strong>3.2 Equipment Specifications.</strong> Each{" "}
                {v.model} unit includes: 21.5&quot; HD touchscreen display
                with AI-powered product recognition, integrated cashless payment
                system (credit/debit card, Apple Pay, Google Pay), cloud-based
                remote management and inventory tracking, energy-efficient LED
                lighting with adjustable temperature zones, ADA-compliant
                design, and standard manufacturer&apos;s warranty.
              </p>
              <p className="mt-3">
                <strong>3.3 Condition.</strong> All Equipment shall be new and
                in original manufacturer packaging unless otherwise specified in
                writing.
              </p>
              <p className="mt-3">
                <strong>3.4 Title and Risk of Loss.</strong> Title to the
                Equipment shall pass to Buyer upon Seller&apos;s delivery of
                the Equipment to the designated carrier for shipment. Risk of
                loss shall transfer to Buyer at the same time.
              </p>
              <InitialsField
                sectionKey="section_3"
                token={token}
                existingInitial={initialsMap["section_3"]}
                onInitialed={handleInitialed}
              />
            </div>
            </>)}

            {/* ============ SECTION 4: Shipping & Freight ============ */}
            {agreement.include_shipping_storage !== false && (<>
            <SectionHeader
              num={4}
              title="Shipping &amp; Freight"
              requiresInitials
            />
            <div>
              <p>
                <strong>4.1 Standard Freight.</strong> The standard freight rate
                is <strong>{v.stdFreight}</strong> per machine for delivery
                within the continental United States.
              </p>
              <p className="mt-3">
                <strong>4.2 Discounted Freight.</strong> Buyer&apos;s
                negotiated freight rate is{" "}
                <strong>{v.freightPerMachine}</strong> per machine.
              </p>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Freight Per Machine
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.freightPerMachine}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Freight ({v.qty} machine
                      {v.qty !== 1 ? "s" : ""})
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.freightTotal}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-4">
                <strong>4.3 Shipping Timeline.</strong> Seller shall use
                commercially reasonable efforts to ship Equipment within 15-25
                Business Days of payment receipt. Seller shall provide tracking
                information to Buyer upon shipment.
              </p>
              <p className="mt-3">
                <strong>4.4 Delivery Address.</strong> Equipment shall be
                shipped to Buyer&apos;s designated delivery address or, if Buyer
                has enrolled in the Storage Program (Section 8), to Seller&apos;s
                warehouse facility.
              </p>
              <p className="mt-3">
                <strong>4.5 Inspection.</strong> Buyer shall inspect Equipment
                within five (5) Business Days of delivery and notify Seller of
                any visible shipping damage. Failure to provide timely notice
                shall constitute acceptance of the Equipment&apos;s physical
                condition.
              </p>
              <InitialsField
                sectionKey="section_4"
                token={token}
                existingInitial={initialsMap["section_4"]}
                onInitialed={handleInitialed}
              />
            </div>
            </>)}

            {/* ============ SECTION 5: Location Services ============ */}
            {agreement.include_location_services !== false && (<>
            <SectionHeader
              num={5}
              title="Location Services"
              requiresInitials
            />
            <div>
              <p>
                <strong>5.1 Scope of Services.</strong> Seller shall provide
                Location Services to identify, vet, and secure suitable vending
                machine placement locations on behalf of Buyer. Seller shall use
                commercially reasonable efforts to identify locations that meet
                reasonable criteria for vending machine placement, including but
                not limited to foot traffic, accessibility, and business type.
              </p>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Locations Purchased
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.locations}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fee Per Secured Location
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.locationFee}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Maximum Service Value
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.maxLocationValue}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-4">
                <strong>5.2 Service Timeline.</strong> Seller shall use
                commercially reasonable efforts to secure all purchased locations
                within <strong>{v.locationTimeline} days</strong> of the
                Effective Date or the date full payment is received, whichever
                is later.
              </p>
              <p className="mt-3">
                <strong>5.3 Location Delivery.</strong> For each Secured
                Location, Seller shall provide Buyer with: (a) business name
                and address, (b) contact person and information, (c) confirmed
                placement details, and (d) any relevant notes about the
                location.
              </p>
              <p className="mt-3">
                <strong>5.4 Location Rejection.</strong> Buyer may reject a
                Secured Location within five (5) Business Days of delivery if
                the location does not reasonably meet the criteria for vending
                machine placement. Buyer&apos;s rejection allowance is:{" "}
                <strong>{v.locationRejection}</strong>. Rejected locations
                beyond this allowance shall be considered accepted.
              </p>
              <p className="mt-3">
                <strong>5.5 Replacement.</strong> If Buyer reasonably rejects a
                Secured Location within the allowance, Seller shall use
                commercially reasonable efforts to provide a replacement
                location within thirty (30) days.
              </p>
              <p className="mt-3">
                <strong>5.6 No Guarantee of Revenue.</strong> Seller does not
                guarantee any specific revenue, profit, or return on investment
                from any Secured Location. Location Services are limited to
                identifying and securing the location; actual business
                performance depends on Buyer&apos;s operations, product
                selection, pricing, and market conditions.
              </p>
              <InitialsField
                sectionKey="section_5"
                token={token}
                existingInitial={initialsMap["section_5"]}
                onInitialed={handleInitialed}
              />
            </div>
            </>)}

            {/* ============ SECTION 6: Payment Terms ============ */}
            <SectionHeader
              num={6}
              title="Payment Terms"
              requiresInitials
            />
            <div>
              <p>
                <strong>6.1 Total Amount Due.</strong> The total amount due
                prior to procurement of Equipment is:
              </p>
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-green-900">
                    Total Due Prior to Procurement
                  </span>
                  <span className="text-2xl font-bold text-green-700">
                    {v.totalDue}
                  </span>
                </div>
                {agreement.location_services_deposit_only && agreement.include_location_services !== false && (
                  <p className="mt-2 text-xs text-green-700 italic">
                    + {currency(Math.max(0, (Number(agreement.max_location_service_value) || 0) - (Number(agreement.location_services_deposit_amount) || 0)))} Location Services balance due upon fulfillment of secured locations
                  </p>
                )}
              </div>
              <p className="mt-4">
                <strong>6.2 Payment Schedule.</strong> Full payment of the
                Total Amount Due is required prior to Seller initiating
                procurement of Equipment. Seller shall not begin procurement
                until full payment is received and cleared.
              </p>
              <p className="mt-3">
                <strong>6.3 Accepted Payment Methods.</strong> Payments may be
                made via wire transfer, ACH, certified check, or other methods
                agreed upon in writing.
                {agreement.payment_method_notes && (
                  <span>
                    {" "}
                    <em>Note: {agreement.payment_method_notes}</em>
                  </span>
                )}
              </p>
              <p className="mt-3">
                <strong>6.4 Late Payments.</strong> Any amount not paid when
                due shall bear interest at the rate of 1.5% per month or the
                maximum rate permitted by law, whichever is less.
              </p>
              <p className="mt-3">
                <strong>6.5 Taxes.</strong> All prices are exclusive of
                applicable sales tax, use tax, and other governmental charges.
                Buyer shall be responsible for all such taxes and charges
                applicable to the purchase.
              </p>
              <InitialsField
                sectionKey="section_6"
                token={token}
                existingInitial={initialsMap["section_6"]}
                onInitialed={handleInitialed}
              />
            </div>

            {/* ============ SECTION 7: Location Service Payment Terms ============ */}
            {agreement.include_location_services !== false && (<>
            <SectionHeader
              num={7}
              title="Location Service Payment Terms"
              requiresInitials
            />
            <div>
              <p>
                <strong>7.1 Invoicing.</strong> Seller shall invoice Buyer for
                Location Services upon delivery of each Secured Location.
                Invoices shall include the location details and the applicable
                fee.
              </p>
              {agreement.location_services_deposit_only ? (
                <>
                  <p className="mt-3">
                    <strong>7.2 Deposit Payment.</strong> A non-refundable deposit of{" "}
                    <strong>{currency(Math.min(Number(agreement.location_services_deposit_amount) || 0, Number(agreement.max_location_service_value) || 0))}</strong>{" "}
                    is due prior to procurement of Location Services. Procurement will not begin until the deposit is received and cleared.
                  </p>
                  <p className="mt-3">
                    <strong>7.3 Remaining Balance.</strong> The remaining balance of{" "}
                    <strong>{currency(Math.max(0, (Number(agreement.max_location_service_value) || 0) - (Number(agreement.location_services_deposit_amount) || 0)))}</strong>{" "}
                    shall be invoiced upon fulfillment of secured locations and is due on receipt of the invoice. The total amount invoiced for Location Services shall not exceed the Maximum Service Value of{" "}
                    <strong>{v.maxLocationValue}</strong>.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3">
                    <strong>7.2 Payment Terms.</strong> Payment for Location
                    Services is{" "}
                    <strong>{v.locationPayTerms}</strong>.
                  </p>
                  <p className="mt-3">
                    <strong>7.3 Maximum Value.</strong> The total amount invoiced
                    for Location Services shall not exceed the Maximum Service Value
                    of <strong>{v.maxLocationValue}</strong> without Buyer&apos;s
                    prior written consent.
                  </p>
                </>
              )}
              <p className="mt-3">
                <strong>7.4 Refund Policy.</strong> Location Services fees are
                non-refundable once a location has been secured and delivered to
                Buyer, unless the location is rejected within the allowance
                specified in Section 5.4 and no replacement is provided.
              </p>
              <InitialsField
                sectionKey="section_7"
                token={token}
                existingInitial={initialsMap["section_7"]}
                onInitialed={handleInitialed}
              />
            </div>
            </>)}

            {/* ============ SECTION 8: Storage Program ============ */}
            {agreement.include_shipping_storage !== false && (<>
            <SectionHeader
              num={8}
              title="Storage Program"
              requiresInitials
            />
            <div>
              <p>
                <strong>8.1 Storage Services.</strong> Seller offers optional
                warehousing and storage for Equipment at Seller&apos;s facility.
                If Buyer elects to use the Storage Program, Equipment will be
                shipped to and held at Seller&apos;s warehouse until Buyer is
                ready for deployment.
              </p>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Storage Fee
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.storageFee} / machine / month
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Free Storage Period
                    </p>
                    <p className="font-semibold text-gray-900">
                      {v.freeStorageMonths} month
                      {v.freeStorageMonths !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-4">
                <strong>8.2 Free Storage Period.</strong> Buyer shall receive{" "}
                <strong>
                  {v.freeStorageMonths} month
                  {v.freeStorageMonths !== 1 ? "s" : ""}
                </strong>{" "}
                of complimentary storage from the date of Equipment delivery to
                Seller&apos;s facility.
              </p>
              <p className="mt-3">
                <strong>8.3 Storage Fees.</strong> After the free storage
                period, Buyer shall pay{" "}
                <strong>{v.storageFee}</strong> per machine per month.
                Storage fees are invoiced monthly in advance and due within five
                (5) Business Days of invoice.
              </p>
              <p className="mt-3">
                <strong>8.4 Insurance.</strong> Seller shall maintain
                commercially reasonable insurance on stored Equipment. Seller&apos;s
                liability for damage to or loss of stored Equipment shall not
                exceed the Equipment purchase price.
              </p>
              <p className="mt-3">
                <strong>8.5 Retrieval.</strong> Buyer may retrieve Equipment
                from storage upon five (5) Business Days&apos; written notice.
                All outstanding storage fees must be paid prior to release of
                Equipment.
              </p>
              <InitialsField
                sectionKey="section_8"
                token={token}
                existingInitial={initialsMap["section_8"]}
                onInitialed={handleInitialed}
              />
            </div>
            </>)}

            {/* ============ SECTION 9 ============ */}
            <SectionHeader num={9} title="Warranty" />
            <div>
              <p>
                <strong>9.1 Manufacturer&apos;s Warranty.</strong> Equipment is
                covered by the manufacturer&apos;s standard warranty, which
                Seller shall pass through to Buyer. Seller shall provide Buyer
                with all warranty documentation.
              </p>
              <p className="mt-3">
                <strong>9.2 Seller&apos;s Warranty.</strong> Seller warrants
                that all Equipment sold hereunder shall be new, free from
                material defects in materials and workmanship, and conform to
                the specifications set forth in this Agreement at the time of
                delivery.
              </p>
              <p className="mt-3">
                <strong>9.3 Warranty Exclusions.</strong> The warranty does not
                cover damage resulting from: (a) misuse, negligence, or
                accident; (b) unauthorized modifications or repairs; (c)
                improper installation; (d) normal wear and tear; or (e) force
                majeure events.
              </p>
              <p className="mt-3">
                <strong>9.4 Disclaimer.</strong> EXCEPT AS EXPRESSLY SET FORTH
                IN THIS SECTION, SELLER MAKES NO WARRANTIES, EXPRESS OR
                IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                NON-INFRINGEMENT.
              </p>
            </div>

            {/* ============ SECTION 10 ============ */}
            <SectionHeader num={10} title="Limitation of Liability" />
            <div>
              <p>
                <strong>10.1</strong> IN NO EVENT SHALL EITHER PARTY BE LIABLE
                TO THE OTHER PARTY FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO
                LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY,
                ARISING OUT OF OR RELATED TO THIS AGREEMENT, REGARDLESS OF THE
                FORM OF ACTION OR THEORY OF LIABILITY, EVEN IF SUCH PARTY HAS
                BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
              <p className="mt-3">
                <strong>10.2</strong> SELLER&apos;S TOTAL AGGREGATE LIABILITY
                UNDER THIS AGREEMENT SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY
                BUYER TO SELLER UNDER THIS AGREEMENT.
              </p>
            </div>

            {/* ============ SECTION 11 ============ */}
            <SectionHeader num={11} title="Indemnification" />
            <div>
              <p>
                <strong>11.1</strong> Each Party shall indemnify, defend, and
                hold harmless the other Party, its officers, directors,
                employees, agents, and affiliates from and against any and all
                claims, damages, losses, liabilities, costs, and expenses
                (including reasonable attorneys&apos; fees) arising out of or
                related to: (a) any breach of this Agreement by the
                indemnifying Party; (b) the indemnifying Party&apos;s
                negligence or willful misconduct; or (c) any violation of
                applicable laws by the indemnifying Party.
              </p>
            </div>

            {/* ============ SECTION 12 ============ */}
            <SectionHeader
              num={12}
              title="Intellectual Property &amp; Software"
            />
            <div>
              <p>
                <strong>12.1 Software License.</strong> Equipment includes
                pre-installed proprietary software. Buyer receives a
                non-exclusive, non-transferable license to use the software
                solely in connection with the Equipment. Buyer shall not
                reverse-engineer, modify, or distribute the software.
              </p>
              <p className="mt-3">
                <strong>12.2 Updates.</strong> Seller may, at its discretion,
                provide software updates and patches. Such updates shall be
                subject to the terms of this Agreement.
              </p>
              <p className="mt-3">
                <strong>12.3 Data.</strong> Buyer retains ownership of all
                sales and transaction data generated by Buyer&apos;s use of
                the Equipment. Seller may collect and use anonymized,
                aggregated operational data for product improvement purposes.
              </p>
            </div>

            {/* ============ SECTION 13 ============ */}
            <SectionHeader num={13} title="Confidentiality" />
            <div>
              <p>
                <strong>13.1</strong> Each Party agrees to maintain the
                confidentiality of all non-public information received from the
                other Party in connection with this Agreement, including but not
                limited to pricing, business plans, customer lists, and
                technical data (&quot;Confidential Information&quot;).
              </p>
              <p className="mt-3">
                <strong>13.2</strong> Confidential Information shall not include
                information that: (a) is or becomes publicly available through
                no fault of the receiving Party; (b) was known to the receiving
                Party prior to disclosure; (c) is independently developed
                without use of Confidential Information; or (d) is required to
                be disclosed by law or court order.
              </p>
              <p className="mt-3">
                <strong>13.3</strong> The obligations of confidentiality shall
                survive termination of this Agreement for a period of two (2)
                years.
              </p>
            </div>

            {/* ============ SECTION 14 ============ */}
            <SectionHeader num={14} title="Term and Termination" />
            <div>
              <p>
                <strong>14.1 Term.</strong> This Agreement shall be effective as
                of the Effective Date and shall continue until all obligations
                have been fully performed, unless earlier terminated in
                accordance with this Section.
              </p>
              <p className="mt-3">
                <strong>14.2 Termination for Breach.</strong> Either Party may
                terminate this Agreement upon thirty (30) days&apos; written
                notice if the other Party materially breaches any provision and
                fails to cure such breach within the notice period.
              </p>
              <p className="mt-3">
                <strong>14.3 Termination for Convenience.</strong> Buyer may
                cancel this Agreement prior to Seller initiating procurement,
                subject to a cancellation fee equal to ten percent (10%) of the
                Total Amount Due.
              </p>
              <p className="mt-3">
                <strong>14.4 Effect of Termination.</strong> Upon termination:
                (a) Buyer shall pay for all Equipment delivered and Location
                Services rendered prior to termination; (b) all licenses
                granted hereunder shall survive with respect to Equipment for
                which payment has been received; (c) Sections 10, 11, 13, and
                20 shall survive termination.
              </p>
            </div>

            {/* ============ SECTION 15 ============ */}
            <SectionHeader num={15} title="Force Majeure" />
            <div>
              <p>
                Neither Party shall be liable for any failure or delay in
                performance due to causes beyond its reasonable control,
                including but not limited to acts of God, war, terrorism,
                pandemic, epidemic, government actions, fire, flood, earthquake,
                strikes, labor disputes, supply chain disruptions, or failures
                of third-party carriers or suppliers (each, a &quot;Force
                Majeure Event&quot;). The affected Party shall promptly notify
                the other Party and use commercially reasonable efforts to
                mitigate the impact. If a Force Majeure Event continues for
                more than ninety (90) days, either Party may terminate this
                Agreement without liability.
              </p>
            </div>

            {/* ============ SECTION 16 ============ */}
            <SectionHeader num={16} title="Compliance with Laws" />
            <div>
              <p>
                Each Party shall comply with all applicable federal, state, and
                local laws, regulations, and ordinances in connection with its
                performance under this Agreement. Buyer shall be solely
                responsible for obtaining all permits, licenses, and approvals
                required to operate the Equipment at any location.
              </p>
            </div>

            {/* ============ SECTION 17 ============ */}
            <SectionHeader num={17} title="Assignment" />
            <div>
              <p>
                Neither Party may assign this Agreement without the prior
                written consent of the other Party, except that either Party
                may assign this Agreement to an affiliate or in connection with
                a merger, acquisition, or sale of all or substantially all of
                its assets. Any purported assignment in violation of this
                Section shall be void.
              </p>
            </div>

            {/* ============ SECTION 18 ============ */}
            <SectionHeader num={18} title="Independent Contractor" />
            <div>
              <p>
                The relationship between the Parties is that of independent
                contractors. Nothing in this Agreement shall be construed to
                create a partnership, joint venture, franchise, or
                employer-employee relationship. Neither Party has the authority
                to bind the other in any manner whatsoever.
              </p>
            </div>

            {/* ============ SECTION 19 ============ */}
            <SectionHeader num={19} title="Notices" />
            <div>
              <p>
                All notices required or permitted under this Agreement shall be
                in writing and shall be deemed duly given when: (a) delivered
                personally; (b) sent by certified mail, return receipt
                requested; (c) sent by overnight courier; or (d) sent by email
                with confirmation of receipt. Notices shall be sent to the
                addresses set forth above or such other addresses as may be
                designated in writing.
              </p>
            </div>

            {/* ============ SECTION 20 ============ */}
            <SectionHeader num={20} title="Governing Law &amp; Dispute Resolution" />
            <div>
              <p>
                <strong>20.1 Governing Law.</strong> This Agreement shall be
                governed by and construed in accordance with the laws of the
                State of <strong>{v.governingState}</strong>, without regard to
                its conflict of laws provisions.
              </p>
              <p className="mt-3">
                <strong>20.2 Dispute Resolution.</strong> In the event of any
                dispute arising out of or relating to this Agreement, the
                Parties shall first attempt to resolve the dispute through good
                faith negotiation. If the dispute cannot be resolved within
                thirty (30) days, either Party may initiate binding arbitration
                in accordance with the rules of the American Arbitration
                Association in <strong>{v.venueState}</strong>.
              </p>
              <p className="mt-3">
                <strong>20.3 Venue.</strong> For any matters not subject to
                arbitration, the exclusive venue shall be the state or federal
                courts located in <strong>{v.venueState}</strong>, and each
                Party consents to the jurisdiction of such courts.
              </p>
              <p className="mt-3">
                <strong>20.4 Attorneys&apos; Fees.</strong> In any action to
                enforce this Agreement, the prevailing Party shall be entitled
                to recover its reasonable attorneys&apos; fees and costs.
              </p>
            </div>

            {/* ============ SECTION 21 ============ */}
            <SectionHeader num={21} title="Entire Agreement" />
            <div>
              <p>
                This Agreement, including all Schedules and Exhibits attached
                hereto, constitutes the entire agreement between the Parties
                and supersedes all prior and contemporaneous agreements,
                representations, and understandings, whether written or oral,
                relating to the subject matter hereof.
              </p>
            </div>

            {/* ============ SECTION 22 ============ */}
            <SectionHeader num={22} title="Amendments" />
            <div>
              <p>
                This Agreement may only be amended or modified by a written
                instrument signed by both Parties. No waiver of any provision
                shall constitute a waiver of any other provision or a
                continuing waiver.
              </p>
            </div>

            {/* ============ SECTION 23 ============ */}
            <SectionHeader num={23} title="Severability" />
            <div>
              <p>
                If any provision of this Agreement is held to be invalid,
                illegal, or unenforceable, the remaining provisions shall
                continue in full force and effect. The Parties shall negotiate
                in good faith to replace any invalid provision with a valid
                provision that achieves the original intent.
              </p>
            </div>

            {/* ============ SECTION 24 ============ */}
            <SectionHeader num={24} title="Waiver" />
            <div>
              <p>
                The failure of either Party to enforce any right or provision
                of this Agreement shall not constitute a waiver of such right
                or provision. Any waiver must be in writing and signed by the
                waiving Party.
              </p>
            </div>

            {/* ============ SECTION 25 ============ */}
            <SectionHeader num={25} title="Counterparts" />
            <div>
              <p>
                This Agreement may be executed in counterparts, each of which
                shall be deemed an original and all of which together shall
                constitute one and the same instrument. Electronic signatures
                and digital copies shall have the same legal effect as original
                signatures.
              </p>
            </div>

            {/* ============ SECTION 26 ============ */}
            <SectionHeader num={26} title="Headings" />
            <div>
              <p>
                The headings in this Agreement are for convenience of reference
                only and shall not affect the interpretation or construction of
                this Agreement.
              </p>
            </div>

            {/* ============ SECTION 27 ============ */}
            <SectionHeader num={27} title="No Third-Party Beneficiaries" />
            <div>
              <p>
                This Agreement is for the sole benefit of the Parties and their
                respective permitted successors and assigns. Nothing in this
                Agreement shall confer any rights or remedies on any third
                party.
              </p>
            </div>

            {/* ============ SECTION 28 ============ */}
            <SectionHeader num={28} title="Survival" />
            <div>
              <p>
                The provisions of Sections 9, 10, 11, 12, 13, 20, 27, and 28
                shall survive the expiration or termination of this Agreement.
              </p>
            </div>

            {/* ============ SECTION 29 ============ */}
            <SectionHeader num={29} title="Good Faith" />
            <div>
              <p>
                Each Party shall act in good faith in the performance of its
                obligations under this Agreement and shall cooperate
                reasonably with the other Party to achieve the purposes of this
                Agreement.
              </p>
            </div>

            {/* ============ SECTION 30 ============ */}
            <SectionHeader
              num={30}
              title="Electronic Signatures &amp; Consent"
            />
            <div>
              <p>
                <strong>30.1</strong> The Parties agree that this Agreement may
                be executed electronically and that electronic signatures shall
                be legally binding and enforceable in accordance with the
                Electronic Signatures in Global and National Commerce Act
                (E-SIGN Act) and applicable state law.
              </p>
              <p className="mt-3">
                <strong>30.2</strong> By signing this Agreement electronically,
                each Party: (a) consents to conduct this transaction
                electronically; (b) acknowledges that the electronic signature
                is the legal equivalent of a manual signature; and (c) agrees
                that a printed version of this electronically signed Agreement
                shall be admissible in any legal proceeding.
              </p>
            </div>

            {/* ============ SECTION 31 ============ */}
            <SectionHeader num={31} title="Acknowledgment" />
            <div>
              <p>
                Each Party acknowledges that it has read this Agreement, fully
                understands its terms and conditions, and voluntarily agrees to
                be bound by them. Each Party further represents and warrants
                that the person executing this Agreement on its behalf is duly
                authorized to do so.
              </p>
            </div>

            {/* ============================================================ */}
            {/*  SCHEDULES                                                    */}
            {/* ============================================================ */}

            <hr className="border-gray-200 my-8" />

            {/* ============ SCHEDULE A ============ */}
            {agreement.include_equipment !== false && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                Schedule A &mdash; Equipment Order Details
              </h2>
              <p className="text-xs font-medium text-green-600 uppercase tracking-wider mb-4">
                Requires Initials
              </p>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                        Item
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-4 py-3 text-gray-600">Machine Model</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.model}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-600">Quantity</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.qty}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-600">Unit Price</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.unitPrice}
                      </td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="px-4 py-3 font-semibold text-green-900">
                        Equipment Subtotal
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-700 text-lg">
                        {v.subtotal}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {agreement.machine_notes && (
                <p className="mt-3 text-sm text-gray-500 italic">
                  Notes: {agreement.machine_notes}
                </p>
              )}
              <InitialsField
                sectionKey="schedule_a"
                token={token}
                existingInitial={initialsMap["schedule_a"]}
                onInitialed={handleInitialed}
              />
            </div>
            )}

            {/* ============ SCHEDULE B ============ */}
            {agreement.include_location_services !== false && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                Schedule B &mdash; Location Services Details
              </h2>
              <p className="text-xs font-medium text-green-600 uppercase tracking-wider mb-4">
                Requires Initials
              </p>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                        Item
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-4 py-3 text-gray-600">
                        Locations Purchased
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.locations}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-600">
                        Fee Per Secured Location
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.locationFee}
                      </td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="px-4 py-3 font-semibold text-green-900">
                        Maximum Service Value
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-700 text-lg">
                        {v.maxLocationValue}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <p>
                  <strong>Service Timeline:</strong> {v.locationTimeline} days
                  from Effective Date or payment receipt.
                </p>
                <p>
                  <strong>Payment Terms:</strong> {v.locationPayTerms}
                </p>
                <p>
                  <strong>Rejection Allowance:</strong> {v.locationRejection}
                </p>
              </div>
              <InitialsField
                sectionKey="schedule_b"
                token={token}
                existingInitial={initialsMap["schedule_b"]}
                onInitialed={handleInitialed}
              />
            </div>
            )}

            {/* ============ SCHEDULE C ============ */}
            {agreement.include_shipping_storage !== false && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                Schedule C &mdash; Shipping &amp; Storage Details
              </h2>
              <p className="text-xs font-medium text-green-600 uppercase tracking-wider mb-4">
                Requires Initials
              </p>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                        Item
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-4 py-3 text-gray-600">
                        Standard Freight Rate
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.stdFreight} / machine
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-600">
                        Your Freight Rate
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.freightPerMachine} / machine
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-600">
                        Total Freight ({v.qty} machine
                        {v.qty !== 1 ? "s" : ""})
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.freightTotal}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-600">
                        Storage Fee
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.storageFee} / machine / month
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-600">
                        Free Storage Period
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {v.freeStorageMonths} month
                        {v.freeStorageMonths !== 1 ? "s" : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {agreement.shipping_notes && (
                <p className="mt-3 text-sm text-gray-500 italic">
                  Shipping Notes: {agreement.shipping_notes}
                </p>
              )}
              <InitialsField
                sectionKey="schedule_c"
                token={token}
                existingInitial={initialsMap["schedule_c"]}
                onInitialed={handleInitialed}
              />
            </div>
            )}
          </div>

          {/* ============================================================ */}
          {/*  SIGNATURE SECTION                                            */}
          {/* ============================================================ */}
          <div className="border-t-2 border-green-200 px-6 sm:px-10 py-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <PenTool className="h-5 w-5 text-green-600" />
              Operator Signature
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              By signing below, you acknowledge that you have read, understand,
              and agree to all terms and conditions of this Agreement.
            </p>

            {!allInitialsComplete && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-6">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Initials Required
                    </p>
                    <p className="text-sm text-amber-700 mt-1">
                      Please initial all {requiredInitials.length} required
                      sections before signing. You have completed{" "}
                      {requiredInitials.filter((k) => initialsMap[k]).length} of{" "}
                      {requiredInitials.length}.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {requiredInitials.filter(
                        (key) => !initialsMap[key],
                      ).map((key) => (
                        <li
                          key={key}
                          className="text-xs text-amber-600 flex items-center gap-1"
                        >
                          <X className="h-3 w-3" />
                          {key.replace("_", " ").replace(/\b\w/g, (c) =>
                            c.toUpperCase(),
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div
              className={
                allInitialsComplete ? "" : "opacity-50 pointer-events-none"
              }
            >
              {/* Signer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={signerCompany}
                    onChange={(e) => setSignerCompany(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Signature Mode Toggle */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Signature
                </label>
                <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setSignatureMode("type")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                      signatureMode === "type"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Type Signature
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureMode("draw")}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                      signatureMode === "draw"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Draw Signature
                  </button>
                </div>
              </div>

              {/* Type Signature */}
              {signatureMode === "type" && (
                <div className="mb-6">
                  <input
                    type="text"
                    placeholder="Type your full name as signature"
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-2xl italic text-gray-800 placeholder:text-gray-300 placeholder:not-italic placeholder:text-base focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
                  />
                  {typedSignature.trim() && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs text-gray-400 mb-1">Preview</p>
                      <p
                        className="text-3xl italic text-gray-800"
                        style={{
                          fontFamily:
                            "'Georgia', 'Times New Roman', serif",
                        }}
                      >
                        {typedSignature}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Draw Signature */}
              {signatureMode === "draw" && (
                <div className="mb-6">
                  <SignatureCanvas onSignature={setDrawnSignature} />
                </div>
              )}

              {/* Date */}
              <div className="mb-6">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                  Date
                </label>
                <input
                  type="text"
                  readOnly
                  value={todayFormatted()}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700"
                />
              </div>

              {/* Error */}
              {signError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">{signError}</p>
                </div>
              )}

              {/* Sign Button */}
              <button
                onClick={handleSign}
                disabled={
                  signing ||
                  !allInitialsComplete ||
                  !signerName.trim() ||
                  (signatureMode === "type"
                    ? !typedSignature.trim()
                    : !drawnSignature)
                }
                className="w-full rounded-lg bg-green-600 px-6 py-4 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
              >
                {signing ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" /> Signing
                    Agreement...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <PenTool className="h-5 w-5" /> Sign Agreement
                  </span>
                )}
              </button>

              <p className="mt-3 text-xs text-center text-gray-400">
                By clicking &quot;Sign Agreement,&quot; you agree to the terms
                above and consent to electronic signature per Section 30.
              </p>
            </div>
          </div>

          {/* ============================================================ */}
          {/*  APEX SIGNATURE BLOCK (pre-filled, read-only)                */}
          {/* ============================================================ */}
          <div className="border-t border-gray-200 px-6 sm:px-10 py-6 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
              Seller
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Company</p>
                <p className="font-semibold text-gray-900">{v.apex}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Representative</p>
                <p className="font-semibold text-gray-900">{v.apexRep}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Title</p>
                <p className="font-semibold text-gray-900">{v.apexRepTitle}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="font-semibold text-gray-900">
                  {agreement.apex_signed_at
                    ? formatDate(agreement.apex_signed_at)
                    : "Pending"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center print:mt-4">
          <p className="text-xs text-gray-400">
            Apex AI Vending &bull; vendingconnector.com
          </p>
          <p className="text-xs text-gray-300 mt-1">
            This document is confidential and intended solely for the named
            recipient.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Section Header Component                                           */
/* ================================================================== */

function SectionHeader({
  num,
  title,
  requiresInitials,
}: {
  num: number;
  title: string;
  requiresInitials?: boolean;
}) {
  return (
    <div className="border-b border-gray-100 pb-1 pt-4">
      <h2 className="text-lg font-bold text-gray-900">
        Section {num} &mdash; {title}
      </h2>
      {requiresInitials && (
        <p className="text-xs font-medium text-green-600 uppercase tracking-wider mt-0.5">
          Requires Initials
        </p>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Page Export with Suspense                                           */
/* ================================================================== */

export default function OperatorSigningPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      }
    >
      <SigningContent />
    </Suspense>
  );
}
