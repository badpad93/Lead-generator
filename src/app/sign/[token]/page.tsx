"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams } from "next/navigation";
import { getRequiredInitialKeys } from "@/lib/agreementInitials";
import { resolveAgreementSections } from "@/lib/agreements/sections";
import { formatContractDate } from "@/lib/agreements/formatDate";
import AgreementBody from "@/app/components/AgreementBody";
import CoffeeSupplyAgreementSection from "@/app/components/CoffeeSupplyAgreementSection";
import { displayTitle } from "@/lib/agreements/titleDisplay";
import type { CoffeeSupplySnapshotLike } from "@/lib/agreements/coffeeSupplyPackage";
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

  coffee_supply_required: boolean | null;
  coffee_supply_snapshot: CoffeeSupplySnapshotLike | null;

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

// Shared with the initials + sign-submit API routes so the page can
// never require a different set than the server validates.
function getRequiredInitials(agreement: PurchaseAgreement | null): string[] {
  return getRequiredInitialKeys(agreement);
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
  // Anchor date-only strings to local midnight so the calendar date does not
  // shift back a day in negative-UTC-offset locales (see formatContractDate).
  return formatContractDate(dateStr, "_______________");
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

  /* ---------- Agreement structure (shared source) ---------- */
  // Inclusion is resolved once here for the post-signature success view
  // below (which references the equipment line). The full numbered
  // agreement — sections, numbering, clause language and initials — is
  // rendered by <AgreementBody>, which derives everything from the same
  // canonical content source (clauses.ts + sections.ts) that the PDF and
  // CRM preview use, so all three are identical.
  const sec = resolveAgreementSections(agreement);

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
              The Purchase Agreement has been
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
              {sec.equipment && (
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
    // Optional — never fabricate a legal title; omit cleanly when blank.
    operatorTitle: displayTitle(agreement.operator_title) ?? "",
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
  // Branch on agreement type — Location Placement uses a different layout
  if (agreement.agreement_type === "location_placement") {
    return (
      <LocationPlacementSignView
        agreement={agreement}
        token={token}
        signerName={signerName}
        setSignerName={setSignerName}
        signerCompany={signerCompany}
        setSignerCompany={setSignerCompany}
        signerTitle={signerTitle}
        setSignerTitle={setSignerTitle}
        signatureMode={signatureMode}
        setSignatureMode={setSignatureMode}
        typedSignature={typedSignature}
        setTypedSignature={setTypedSignature}
        drawnSignature={drawnSignature}
        setDrawnSignature={setDrawnSignature}
        signing={signing}
        signError={signError}
        handleSign={handleSign}
      />
    );
  }

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
            Purchase Agreement
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
                This Purchase Agreement (the
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

            {/* Numbered sections & schedules — rendered from the single
                canonical content source (src/lib/agreements/clauses.ts),
                identical to the executed PDF and the CRM preview. */}
            <AgreementBody
              source={agreement as unknown as Record<string, unknown>}
              renderInitials={(key) => (
                <InitialsField
                  sectionKey={key}
                  token={token}
                  existingInitial={initialsMap[key]}
                  onInitialed={handleInitialed}
                />
              )}
            />

            {/* Model A parity: the FROZEN captured Equipment Loan & Beverage
                Supply Agreement the single signature also covers, so the
                customer actually sees those terms before signing (identical
                to the admin preview and the executed PDF). */}
            <CoffeeSupplyAgreementSection snapshot={agreement.coffee_supply_snapshot} />
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
              and agree to all terms and conditions of this Agreement
              {agreement.coffee_supply_required
                ? ", including the Equipment Loan & Beverage Supply Agreement set out above"
                : ""}
              .
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
                above and consent to electronic signature per the Electronic
                Signatures &amp; Consent section.
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
/*  Location Placement Sign View                                        */
/* ================================================================== */

interface LocationPlacementSignViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agreement: any;
  token: string;
  signerName: string;
  setSignerName: (v: string) => void;
  signerCompany: string;
  setSignerCompany: (v: string) => void;
  signerTitle: string;
  setSignerTitle: (v: string) => void;
  signatureMode: "type" | "draw";
  setSignatureMode: (m: "type" | "draw") => void;
  typedSignature: string;
  setTypedSignature: (v: string) => void;
  drawnSignature: string;
  setDrawnSignature: (v: string) => void;
  signing: boolean;
  signError: string | null;
  handleSign: () => void;
}

function LocationPlacementSignView(props: LocationPlacementSignViewProps) {
  const { agreement: ag, signerName, setSignerName, signerCompany, setSignerCompany, signerTitle, setSignerTitle, signatureMode, setSignatureMode, typedSignature, setTypedSignature, signing, signError, handleSign } = props;
  const isSigned = !!ag.operator_signed_at;
  const operatorCompany = ag.placement_operator_company || "Vending Operator";
  const termMonths = ag.placement_term_months || 24;
  const machineCount = ag.placement_machine_count || 1;
  const machineType = ag.placement_machine_type || "VendEra AI Machine";
  const effectiveDate = formatContractDate(ag.effective_date, "—");

  const fmtMoney = (n: number) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl py-8 px-4 sm:px-6">
        <div className="mb-8 text-center">
          <div className="inline-block rounded-lg bg-green-600 px-4 py-1 mb-3">
            <span className="text-sm font-bold text-white tracking-wider uppercase">{operatorCompany}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Location Placement Agreement</h1>
          <p className="text-sm text-gray-500">Effective Date: {effectiveDate}</p>
        </div>

        {isSigned && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">You&apos;ve signed this agreement</p>
              <p className="text-sm text-green-700">Signed on {ag.operator_signed_at ? new Date(ag.operator_signed_at).toLocaleString() : ""}. A fully-executed copy will be emailed to you once the operator countersigns.</p>
            </div>
          </div>
        )}

        {/* Parties */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Parties</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">OPERATOR</p>
              <p className="font-medium text-gray-900">{ag.placement_operator_company || "—"}</p>
              <p className="text-gray-600">{ag.placement_operator_contact || ""}</p>
              <p className="text-gray-600 text-xs">{ag.placement_operator_email || ""}</p>
              <p className="text-gray-600 text-xs">{ag.placement_operator_phone || ""}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">LOCATION (HOST)</p>
              <p className="font-medium text-gray-900">{ag.location_business_name || "—"}</p>
              <p className="text-gray-600">{ag.location_contact_name || ""}{ag.location_contact_title ? ` — ${ag.location_contact_title}` : ""}</p>
              <p className="text-gray-600 text-xs">{ag.location_contact_email || ""}</p>
              <p className="text-gray-600 text-xs">{ag.location_contact_phone || ""}</p>
              {ag.location_address && (
                <p className="text-gray-600 text-xs">{ag.location_address}{ag.location_city ? `, ${ag.location_city}` : ""}{ag.location_state ? `, ${ag.location_state}` : ""} {ag.location_zip || ""}</p>
              )}
            </div>
          </div>
        </div>

        {/* Placement Terms */}
        {ag.include_placement_terms !== false && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-2">Section 1 — Placement Terms</h2>
            <p className="text-sm text-gray-700 leading-relaxed mb-3">
              Operator agrees to install <strong>{machineCount} {machineType}{machineCount === 1 ? "" : "s"}</strong> at the Location for a term of <strong>{termMonths} months</strong> commencing on the Effective Date or installation date, whichever is later.
            </p>
            {ag.placement_exclusivity && (
              <p className="text-sm text-gray-700 leading-relaxed mb-3">
                Location agrees that during the Term, Operator&apos;s machines shall be the <strong>exclusive vending equipment</strong> installed at the premises.
              </p>
            )}
            {ag.placement_notes && (
              <p className="text-sm text-gray-600 italic">Additional terms: {ag.placement_notes}</p>
            )}
          </div>
        )}

        {/* Compensation */}
        {ag.include_compensation !== false && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-2">Section 2 — Compensation</h2>
            {ag.commission_type === "revenue_share" && (
              <p className="text-sm text-gray-700 leading-relaxed">
                Location shall receive <strong>{Number(ag.commission_pct || 0).toFixed(1)}% of net revenue</strong> from machine sales, payable <strong>{ag.commission_payout_schedule || "monthly"}</strong>. Net revenue is calculated as gross sales less applicable taxes and processing fees.
              </p>
            )}
            {ag.commission_type === "flat_monthly" && (
              <p className="text-sm text-gray-700 leading-relaxed">
                Operator shall pay Location <strong>{fmtMoney(ag.commission_monthly_fee)} per month</strong> for the duration of the Term, payable <strong>{ag.commission_payout_schedule || "monthly"}</strong>.
              </p>
            )}
            {ag.commission_type === "none" && (
              <p className="text-sm text-gray-700 leading-relaxed">
                No monetary compensation is provided to Location under this agreement.
              </p>
            )}
            {ag.commission_notes && <p className="text-sm text-gray-600 italic mt-2">{ag.commission_notes}</p>}
          </div>
        )}

        {/* Duration & Termination */}
        {ag.include_duration_termination !== false && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-2">Section 3 — Duration &amp; Termination</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              This Agreement shall remain in effect for {termMonths} months from the Effective Date (or installation date, whichever is later). Either party may terminate this Agreement for cause upon 30 days&apos; written notice if the other party materially breaches any provision and fails to cure such breach within the notice period. Upon termination, Operator shall remove all machines and equipment from the premises within thirty (30) days.
            </p>
          </div>
        )}

        {/* Responsibilities */}
        {ag.include_responsibilities !== false && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
            <h2 className="text-base font-bold text-gray-900 mb-2">Section 4 — Responsibilities</h2>
            <div className="text-sm text-gray-700 leading-relaxed space-y-2">
              <p><strong>OPERATOR shall:</strong> install, service, restock, and maintain the machines at its own expense; carry general commercial liability insurance; pay applicable taxes and provide accurate payout reports; promptly respond to service requests.</p>
              <p><strong>LOCATION shall:</strong> provide a suitable, accessible location with a standard 120V electrical outlet; allow reasonable access for installation, service, restocking, and removal; notify Operator of any service issues; refrain from operating, modifying, or relocating the machines without Operator&apos;s consent.</p>
            </div>
          </div>
        )}

        {/* Standard provisions */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-4">
          <h2 className="text-base font-bold text-gray-900 mb-2">Standard Provisions</h2>
          <div className="text-sm text-gray-700 leading-relaxed space-y-2">
            <p><strong>Ownership.</strong> Title to the machines and equipment remains with Operator at all times. Operator bears the risk of loss.</p>
            <p><strong>Confidentiality.</strong> Each party agrees to keep confidential all non-public business information disclosed in connection with this Agreement.</p>
            <p><strong>Independent Contractors.</strong> The parties are independent contractors; nothing in this Agreement creates a partnership or employer-employee relationship.</p>
            <p><strong>Governing Law.</strong> This Agreement is governed by the laws of the State of {ag.governing_state || "Texas"}.</p>
            <p><strong>Entire Agreement.</strong> This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements. Amendments must be in writing and signed by both parties.</p>
          </div>
        </div>

        {/* Signature */}
        {!isSigned && (
          <div className="rounded-xl border-2 border-green-200 bg-white p-6 mt-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Sign this Agreement</h2>
            <p className="text-sm text-gray-500 mb-5">By signing below, you agree to the terms of this Location Placement Agreement.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30" placeholder="Your full legal name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title / Role</label>
                <input type="text" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30" placeholder="e.g. Owner, Manager" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Business / Location Name</label>
                <input type="text" value={signerCompany} onChange={(e) => setSignerCompany(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30" placeholder={ag.location_business_name || "Your business name"} />
              </div>
            </div>

            <label className="block text-xs font-medium text-gray-700 mb-1">Signature <span className="text-red-500">*</span></label>
            <div className="mb-2 flex gap-2">
              <button type="button" onClick={() => setSignatureMode("type")} className={`text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer ${signatureMode === "type" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Type</button>
              <button type="button" onClick={() => setSignatureMode("draw")} className={`text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer ${signatureMode === "draw" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Draw</button>
            </div>
            {signatureMode === "type" ? (
              <input
                type="text"
                value={typedSignature}
                onChange={(e) => setTypedSignature(e.target.value)}
                placeholder="Type your full name as signature"
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-lg italic font-serif focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30"
                style={{ fontFamily: "'Brush Script MT', cursive" }}
              />
            ) : (
              <p className="text-xs text-gray-500 italic">Use the draw view in the full signing flow above to draw your signature.</p>
            )}

            {signError && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{signError}</div>
            )}

            <button
              type="button"
              onClick={handleSign}
              disabled={signing}
              className="mt-5 w-full rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
              {signing ? "Signing..." : "Sign Agreement"}
            </button>
            <p className="mt-2 text-xs text-gray-400 text-center">A fully-executed copy will be emailed to you once {operatorCompany} countersigns.</p>
          </div>
        )}
      </div>
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
