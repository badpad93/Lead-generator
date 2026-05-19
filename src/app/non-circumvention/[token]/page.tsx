"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, FileText, PenTool, Building2, User, Mail, Phone, MapPin, ShieldCheck } from "lucide-react";

interface NCAgreement {
  id: string;
  token: string;
  operator_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  signature_name: string | null;
  signed_at: string | null;
  confirm_confidential: boolean;
  confirm_no_circumvent: boolean;
  confirm_consequences: boolean;
  created_at: string;
}

function NonCircumventionContent() {
  const { token } = useParams<{ token: string }>();
  const [agreement, setAgreement] = useState<NCAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [operatorName, setOperatorName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneVal, setPhoneVal] = useState("");
  const [address, setAddress] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [confirmConfidential, setConfirmConfidential] = useState(false);
  const [confirmNoCircumvent, setConfirmNoCircumvent] = useState(false);
  const [confirmConsequences, setConfirmConsequences] = useState(false);

  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/non-circumvention/${token}`);
      if (res.ok) {
        const data: NCAgreement = await res.json();
        setAgreement(data);
        setOperatorName(data.operator_name || "");
        setCompanyName(data.company_name || "");
        setEmail(data.email || "");
        setPhoneVal(data.phone || "");
        setAddress(data.address || "");
      } else {
        setError("Agreement not found or has expired.");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  async function handleSign() {
    if (!signatureName.trim() || signatureName.trim().length < 2) {
      setSignError("Please type your full name to sign");
      return;
    }
    if (!confirmConfidential || !confirmNoCircumvent || !confirmConsequences) {
      setSignError("Please confirm all checkboxes before signing");
      return;
    }
    setSigning(true);
    setSignError(null);
    const res = await fetch(`/api/non-circumvention/${token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signature_name: signatureName,
        operator_name: operatorName,
        company_name: companyName,
        email,
        phone: phoneVal,
        address,
        confirm_confidential: confirmConfidential,
        confirm_no_circumvent: confirmNoCircumvent,
        confirm_consequences: confirmConsequences,
      }),
    });
    if (res.ok) {
      setAgreement((a) =>
        a
          ? {
              ...a,
              status: "signed",
              signature_name: signatureName,
              signed_at: new Date().toISOString(),
              confirm_confidential: confirmConfidential,
              confirm_no_circumvent: confirmNoCircumvent,
              confirm_consequences: confirmConsequences,
            }
          : a
      );
    } else {
      const data = await res.json().catch(() => ({}));
      setSignError(data.error || "Failed to sign agreement");
    }
    setSigning(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Agreement Not Found</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const isSigned = agreement.status === "signed";
  const inputClass = "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500";
  const effectiveDate = new Date(agreement.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-green-600 mb-1">Apex AI Vending / Vending Connector</h1>
          <p className="text-sm text-gray-500">Site Walkthrough Non-Circumvention &amp; Confidentiality Agreement</p>
        </div>

        {/* Signed Banner */}
        {isSigned && (
          <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600 mb-2" />
            <p className="font-semibold text-green-800">Agreement Signed</p>
            <p className="text-sm text-green-600 mt-1">
              Thank you! A signed copy has been sent to our team. We will share the location details with you shortly.
            </p>
            {agreement.signed_at && (
              <p className="text-xs text-gray-400 mt-2">
                Signed on {new Date(agreement.signed_at).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Agreement Card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Preamble */}
          <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
            <p className="text-sm text-gray-600 leading-relaxed">
              This Agreement (&quot;Agreement&quot;) is entered into between{" "}
              <strong>Vending Connector / Apex AI Vending</strong> (&quot;Company&quot;) and the Operator identified below.
            </p>
            <p className="text-sm text-gray-500 mt-2">Effective Date: {effectiveDate}</p>
          </div>

          {/* Section 1: Purpose */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">1. Purpose</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              The purpose of this Agreement is to allow the Operator to participate in a site walkthrough, review,
              or evaluation of a prospective vending location prior to purchasing or formally securing the location
              opportunity from the Company.
            </p>
          </div>

          {/* Section 2: Confidential Information */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">2. Confidential Information</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Operator acknowledges that all information provided by the Company related to prospective locations
              is confidential and proprietary, including business names, addresses, decision maker information,
              phone numbers, emails, traffic information, employee counts, operational details, photographs,
              placement opportunities, pricing structures, and negotiation discussions.
            </p>
          </div>

          {/* Section 3: Non-Circumvention */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">3. Non-Circumvention</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Operator agrees they shall not directly or indirectly contact the location independently for placement
              purposes, attempt to secure the location outside of the Company, circumvent the Company, share details
              with third parties, or use the disclosed information to compete against the Company.
            </p>
          </div>

          {/* Section 4: Term */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">4. Term</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              This non-circumvention obligation shall remain in effect for <strong>24 months</strong> from the
              date of disclosure of the location information.
            </p>
          </div>

          {/* Section 5: Liquidated Damages */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">5. Liquidated Damages</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              In the event of a breach, Operator agrees the Company shall be entitled to injunctive relief,
              recovery of legal fees and costs, and liquidated damages equal to <strong>$5,000 OR 25%</strong> of
              estimated placement value, whichever is greater.
            </p>
          </div>

          {/* Section 6: No Ownership Transfer */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">6. No Ownership Transfer</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Disclosure of location information does not grant ownership, exclusivity, or placement rights unless
              a separate placement agreement and payment are completed.
            </p>
          </div>

          {/* Section 7: Good Faith */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">7. Good Faith</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Both parties agree to act in good faith throughout the evaluation and placement process.
            </p>
          </div>

          {/* Section 8: Governing Law */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">8. Governing Law</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              This Agreement shall be governed by the laws of the State of South Carolina.
            </p>
          </div>

          {/* Section 9: Acknowledgement */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              <ShieldCheck className="inline h-3.5 w-3.5 mr-1" />
              9. Acknowledgement
            </p>
            <p className="text-sm text-gray-600 mb-3">By signing, Operator acknowledges that:</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#9632;</span>
                They are reviewing confidential business opportunities
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#9632;</span>
                They understand the Company invested resources sourcing the location
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#9632;</span>
                They agree not to bypass or circumvent the Company
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">&#9632;</span>
                They understand violations may result in legal action
              </li>
            </ul>
          </div>

          {/* Section 10: Operator Details & Signature */}
          <div className="px-6 py-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              <PenTool className="inline h-3.5 w-3.5 mr-1" />
              10. Operator Details &amp; Signature
            </p>

            {isSigned ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Signed</span>
                </div>
                <p className="text-lg italic text-gray-700 font-serif">{agreement.signature_name}</p>
                {agreement.signed_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(agreement.signed_at).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-4">
                  Please verify or update your information below, then sign.
                </p>

                {/* Operator Fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                      <User className="h-3.5 w-3.5" /> Operator Name <span className="text-red-500">*</span>
                    </label>
                    <input type="text" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} className={inputClass} placeholder="Your full name" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                      <Building2 className="h-3.5 w-3.5" /> Company Name
                    </label>
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} placeholder="Your company name" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                        <Mail className="h-3.5 w-3.5" /> Email
                      </label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                        <Phone className="h-3.5 w-3.5" /> Phone
                      </label>
                      <input type="tel" value={phoneVal} onChange={(e) => setPhoneVal(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                      <MapPin className="h-3.5 w-3.5" /> Address
                    </label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="Business address" />
                  </div>
                </div>

                {/* Confirmation Checkboxes */}
                <div className="space-y-3 mb-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmConfidential}
                      onChange={(e) => setConfirmConfidential(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">
                      I acknowledge that all location information shared is confidential and proprietary.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmNoCircumvent}
                      onChange={(e) => setConfirmNoCircumvent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">
                      I agree not to circumvent Vending Connector / Apex AI Vending or contact locations independently.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmConsequences}
                      onChange={(e) => setConfirmConsequences(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">
                      I understand that violations may result in legal action, including liquidated damages of $5,000
                      or 25% of estimated placement value (whichever is greater).
                    </span>
                  </label>
                </div>

                {/* Signature Input */}
                <input
                  type="text"
                  placeholder="Type your full name to sign"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg font-serif italic text-gray-700 placeholder:text-gray-300 placeholder:not-italic focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                {signError && <p className="mt-2 text-sm text-red-600">{signError}</p>}
                <button
                  onClick={handleSign}
                  disabled={signing || !signatureName.trim() || !confirmConfidential || !confirmNoCircumvent || !confirmConsequences}
                  className="mt-3 w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {signing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Signing...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <PenTool className="h-4 w-4" /> Sign Agreement
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">Apex AI Vending — vendingconnector.com</p>
        </div>
      </div>
    </div>
  );
}

export default function NonCircumventionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      }
    >
      <NonCircumventionContent />
    </Suspense>
  );
}
