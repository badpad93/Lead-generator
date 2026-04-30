"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2, CheckCircle2, FileText, PenTool, Building2, User, Mail, Phone, MapPin } from "lucide-react";

interface LocationAgreement {
  id: string;
  token: string;
  business_name: string | null;
  contact_name: string | null;
  title_role: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  signature_name: string | null;
  signed_at: string | null;
  confirm_accurate: boolean;
  confirm_authorized: boolean;
  confirm_agree: boolean;
  created_at: string;
}

function LocationAgreementContent() {
  const { token } = useParams<{ token: string }>();
  const [agreement, setAgreement] = useState<LocationAgreement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [titleRole, setTitleRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [confirmAccurate, setConfirmAccurate] = useState(false);
  const [confirmAuthorized, setConfirmAuthorized] = useState(false);
  const [confirmAgree, setConfirmAgree] = useState(false);

  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/location-agreements/${token}`);
      if (res.ok) {
        const data: LocationAgreement = await res.json();
        setAgreement(data);
        setBusinessName(data.business_name || "");
        setContactName(data.contact_name || "");
        setTitleRole(data.title_role || "");
        setEmail(data.email || "");
        setPhone(data.phone || "");
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
    if (!confirmAccurate || !confirmAuthorized || !confirmAgree) {
      setSignError("Please confirm all checkboxes before signing");
      return;
    }
    setSigning(true);
    setSignError(null);
    const res = await fetch(`/api/location-agreements/${token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signature_name: signatureName,
        business_name: businessName,
        contact_name: contactName,
        title_role: titleRole,
        email,
        phone,
        address,
        confirm_accurate: confirmAccurate,
        confirm_authorized: confirmAuthorized,
        confirm_agree: confirmAgree,
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
              confirm_accurate: confirmAccurate,
              confirm_authorized: confirmAuthorized,
              confirm_agree: confirmAgree,
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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-green-600 mb-1">Apex AI Vending</h1>
          <p className="text-sm text-gray-500">Location Placement Acknowledgment &amp; Intent Agreement</p>
        </div>

        {/* Signed Banner */}
        {isSigned && (
          <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-600 mb-2" />
            <p className="font-semibold text-green-800">Agreement Signed</p>
            <p className="text-sm text-green-600 mt-1">
              Thank you! Your signed agreement has been recorded.
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
          {/* Section 1: Introduction */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">1. Introduction</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              This Location Placement Acknowledgment &amp; Intent Agreement (&quot;Agreement&quot;) is entered into
              between <strong>Apex AI Vending</strong> (&quot;Company&quot;) and the undersigned location
              representative (&quot;Location Partner&quot;). This Agreement is a non-binding acknowledgment of
              mutual interest in the placement of vending machines at the Location Partner&apos;s premises.
            </p>
          </div>

          {/* Section 2: Purpose */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">2. Purpose</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              The purpose of this Agreement is to confirm the Location Partner&apos;s interest in hosting one or
              more vending machines provided by the Company. This document serves as a preliminary acknowledgment
              and does not constitute a binding contract.
            </p>
          </div>

          {/* Section 3: Location Details */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">3. Location Details</p>
            <p className="text-sm text-gray-500 mb-4">
              Please verify or update your business information below.
            </p>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                  <Building2 className="h-3.5 w-3.5" /> Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={isSigned}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                  <MapPin className="h-3.5 w-3.5" /> Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={isSigned}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                    <User className="h-3.5 w-3.5" /> Contact Name
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    disabled={isSigned}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                    Title / Role
                  </label>
                  <input
                    type="text"
                    value={titleRole}
                    onChange={(e) => setTitleRole(e.target.value)}
                    disabled={isSigned}
                    placeholder="e.g. Owner, Manager"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                    <Mail className="h-3.5 w-3.5" /> Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSigned}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                    <Phone className="h-3.5 w-3.5" /> Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isSigned}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Machine Placement Terms */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">4. Machine Placement Terms</p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                The Company will provide, install, and maintain the vending machine(s) at no cost to the Location Partner.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                The Company retains ownership of all machines placed at the location.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                The Location Partner agrees to provide a suitable space with access to a standard electrical outlet.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">•</span>
                The Company is responsible for stocking, servicing, and maintaining the machines.
              </li>
            </ul>
          </div>

          {/* Section 5: Revenue Sharing */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">5. Revenue Sharing</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Revenue-sharing terms, if applicable, will be discussed and agreed upon separately before machine
              installation. This Agreement does not establish any specific revenue-sharing arrangement.
            </p>
          </div>

          {/* Section 6: Duration & Termination */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">6. Duration &amp; Termination</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              This acknowledgment of intent is non-binding. Either party may withdraw interest at any time prior
              to the execution of a formal placement contract. A formal agreement with specific terms will be
              provided before any machine installation.
            </p>
          </div>

          {/* Section 7: Liability */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">7. Liability</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              The Company maintains appropriate insurance coverage for its vending machines. The Location Partner
              is not liable for damage caused by normal wear and tear. Specific liability terms will be outlined
              in the formal placement contract.
            </p>
          </div>

          {/* Section 8: Confidentiality */}
          <div className="px-6 py-5 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">8. Confidentiality</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Both parties agree to keep any business information shared during this process confidential and not
              to disclose it to third parties without prior written consent.
            </p>
          </div>

          {/* Section 9: Acknowledgment & Signature */}
          <div className="px-6 py-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              <PenTool className="inline h-3.5 w-3.5 mr-1" />
              9. Acknowledgment &amp; Signature
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
                <p className="text-sm text-gray-600 mb-4">
                  By signing below, I acknowledge that I have read and understood this Location Placement
                  Acknowledgment &amp; Intent Agreement. I confirm my interest in hosting vending machines at the
                  location specified above.
                </p>

                {/* Checkboxes */}
                <div className="space-y-3 mb-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmAccurate}
                      onChange={(e) => setConfirmAccurate(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">
                      I confirm that the information provided above is accurate and complete.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmAuthorized}
                      onChange={(e) => setConfirmAuthorized(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">
                      I am authorized to act on behalf of the business at the specified location.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmAgree}
                      onChange={(e) => setConfirmAgree(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-700">
                      I understand this is a non-binding acknowledgment of intent and that a formal agreement
                      will be provided before any machine placement.
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
                  disabled={signing || !signatureName.trim() || !confirmAccurate || !confirmAuthorized || !confirmAgree}
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

export default function LocationAgreementPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      }
    >
      <LocationAgreementContent />
    </Suspense>
  );
}
