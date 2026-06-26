"use client";

import { useState, useEffect, use, Fragment } from "react";
import { Loader2, FileText, AlertCircle, Clock, CheckCircle } from "lucide-react";

interface ProposalItem {
  id: string;
  product_name: string;
  category: string | null;
  unit: string;
  retail_price: number;
  quantity: number;
  retail_subtotal: number;
  sort_order: number;
}

interface Proposal {
  id: string;
  proposal_number: string;
  status: string;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  client_phone: string | null;
  company_name: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_website: string | null;
  company_address: string | null;
  company_city: string | null;
  company_state: string | null;
  company_zip: string | null;
  total_retail: number;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
  coffee_pricing_proposal_items: ProposalItem[];
}

export default function PublicProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/coffee/proposals/${token}`);
        if (res.ok) {
          setProposal(await res.json());
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Proposal not found");
        }
      } catch {
        setError("Failed to load proposal");
      }
      setLoading(false);
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Proposal Not Available</h1>
          <p className="text-sm text-gray-500">{error || "This proposal could not be found"}</p>
        </div>
      </div>
    );
  }

  const companyName = proposal.company_name || "Your Vending Partner";
  const items = (proposal.coffee_pricing_proposal_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const isExpired = proposal.valid_until && new Date(proposal.valid_until) < new Date();

  const groupedItems: Record<string, ProposalItem[]> = {};
  for (const item of items) {
    const cat = item.category || "Other";
    if (!groupedItems[cat]) groupedItems[cat] = [];
    groupedItems[cat].push(item);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
              <p className="text-sm text-gray-500 mt-1">Coffee Service Proposal</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{proposal.proposal_number}</p>
              <p className="text-xs text-gray-500">{new Date(proposal.created_at).toLocaleDateString()}</p>
              {proposal.valid_until && (
                <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isExpired ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                }`}>
                  <Clock className="h-3 w-3" />
                  {isExpired ? "Expired" : `Valid until ${new Date(proposal.valid_until).toLocaleDateString()}`}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {/* Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">From</h3>
            <p className="font-semibold text-gray-900">{companyName}</p>
            {proposal.company_email && <p className="text-sm text-gray-600 mt-1">{proposal.company_email}</p>}
            {proposal.company_phone && <p className="text-sm text-gray-600">{proposal.company_phone}</p>}
            {proposal.company_address && (
              <p className="text-sm text-gray-600 mt-1">
                {proposal.company_address}
                {proposal.company_city && `, ${proposal.company_city}`}
                {proposal.company_state && `, ${proposal.company_state}`}
                {proposal.company_zip && ` ${proposal.company_zip}`}
              </p>
            )}
            {proposal.company_website && <p className="text-sm text-green-600 mt-1">{proposal.company_website}</p>}
          </div>

          {(proposal.client_name || proposal.client_company) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Prepared For</h3>
              {proposal.client_company && <p className="font-semibold text-gray-900">{proposal.client_company}</p>}
              {proposal.client_name && <p className="text-sm text-gray-600 mt-1">{proposal.client_name}</p>}
              {proposal.client_email && <p className="text-sm text-gray-600">{proposal.client_email}</p>}
              {proposal.client_phone && <p className="text-sm text-gray-600">{proposal.client_phone}</p>}
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left font-semibold text-gray-600">Product</th>
                <th className="px-5 py-3 text-center font-semibold text-gray-600">Qty</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Unit Price</th>
                <th className="px-5 py-3 text-right font-semibold text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedItems).map(([category, catItems]) => (
                <Fragment key={category}>
                  <tr>
                    <td colSpan={4} className="px-5 pt-4 pb-1">
                      <span className="text-xs font-semibold text-green-700 uppercase">{category}</span>
                    </td>
                  </tr>
                  {catItems.map(item => (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3 text-gray-900">{item.product_name}</td>
                      <td className="px-5 py-3 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-5 py-3 text-right text-gray-600">${Number(item.retail_price).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">${Number(item.retail_subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={3} className="px-5 py-4 text-right font-bold text-gray-900">Total</td>
                <td className="px-5 py-4 text-right font-bold text-green-700 text-lg">${Number(proposal.total_retail).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {proposal.notes && (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Notes & Terms</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6">
          <p className="text-xs text-gray-400">
            Proposal {proposal.proposal_number} · {companyName}
          </p>
          {proposal.company_email && (
            <p className="text-xs text-gray-400 mt-1">
              Questions? Contact <a href={`mailto:${proposal.company_email}`} className="text-green-600 hover:underline">{proposal.company_email}</a>
              {proposal.company_phone && <> or call <a href={`tel:${proposal.company_phone}`} className="text-green-600 hover:underline">{proposal.company_phone}</a></>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
