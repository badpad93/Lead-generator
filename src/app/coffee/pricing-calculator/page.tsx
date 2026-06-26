"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2, ArrowLeft, Search, Plus, Trash2, Send, Download, Save,
  DollarSign, TrendingUp, Package, ChevronDown, ChevronUp, Eye, Copy,
  AlertCircle, Check, X, FileText, Users,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  pack_quantity: number;
  unit: string;
  image_url: string | null;
  coffee_categories: { id: string; name: string; slug: string } | null;
}

interface ProposalItem {
  product_id: string | null;
  product_name: string;
  sku: string;
  category: string;
  unit: string;
  unit_cost: number;
  pack_quantity: number;
  retail_price: number;
  quantity: number;
  cost_subtotal: number;
  retail_subtotal: number;
  profit: number;
  margin_pct: number;
}

interface SavedProposal {
  id: string;
  proposal_number: string;
  status: string;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  total_retail: number;
  created_at: string;
}

const DEFAULT_MARKUP: Record<string, number> = {
  "Coffee Beans": 50,
  "Coffee Packets": 50,
  "Ground Coffee": 50,
  "Tea": 45,
  "Coffee Brewers": 35,
  "Cups": 40,
  "Lids": 40,
  "Sleeves": 40,
  "Stirrers": 35,
  "Straws": 35,
  "Cleaning Supplies": 30,
};

function computeItem(item: ProposalItem): ProposalItem {
  const costSubtotal = item.unit_cost * item.quantity;
  const retailSubtotal = item.retail_price * item.quantity;
  const profit = retailSubtotal - costSubtotal;
  const marginPct = retailSubtotal > 0 ? (profit / retailSubtotal) * 100 : 0;
  return { ...item, cost_subtotal: costSubtotal, retail_subtotal: retailSubtotal, profit, margin_pct: marginPct };
}

export default function PricingCalculatorPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [search, setSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [proposalNumber, setProposalNumber] = useState("");
  const [savedProposals, setSavedProposals] = useState<SavedProposal[]>([]);
  const [showProposals, setShowProposals] = useState(false);
  const [shareToken, setShareToken] = useState("");
  const [showBranding, setShowBranding] = useState(false);
  const [umbrellaMargin, setUmbrellaMargin] = useState(40);

  // Client info
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  // Branding (operator's company)
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyCity, setCompanyCity] = useState("");
  const [companyState, setCompanyState] = useState("");
  const [companyZip, setCompanyZip] = useState("");

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { router.push("/login"); return; }
      setToken(session.access_token);

      try {
        const [productsRes, proposalsRes, profileRes] = await Promise.all([
          fetch("/api/coffee/products", { headers: { Authorization: `Bearer ${session.access_token}` } }),
          fetch("/api/coffee/pricing-proposals", { headers: { Authorization: `Bearer ${session.access_token}` } }),
          fetch("/api/auth/me", { headers: { Authorization: `Bearer ${session.access_token}` } }),
        ]);

        if (productsRes.ok) {
          const data = await productsRes.json();
          setProducts(Array.isArray(data) ? data : data.products || []);
        }
        if (proposalsRes.ok) {
          const data = await proposalsRes.json();
          setSavedProposals(Array.isArray(data) ? data : []);
        }
        if (profileRes.ok) {
          const p = await profileRes.json();
          setCompanyName(p.company_name || "");
          setCompanyEmail(p.email || "");
          setCompanyPhone(p.phone || "");
          setCompanyWebsite(p.website || "");
          setCompanyAddress(p.address || "");
          setCompanyCity(p.city || "");
          setCompanyState(p.state || "");
          setCompanyZip(p.zip || "");
        }
      } catch (err) {
        console.error("Failed to load pricing calculator data:", err);
      }
      setLoading(false);
    }
    init();
  }, [router]);

  const addProduct = useCallback((product: Product) => {
    const category = product.coffee_categories?.name || "Other";
    const markupPct = DEFAULT_MARKUP[category] || 40;
    const retailPrice = Math.ceil(product.price * (1 + markupPct / 100) * 100) / 100;

    const newItem = computeItem({
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      category,
      unit: product.unit,
      unit_cost: product.price,
      pack_quantity: product.pack_quantity || 1,
      retail_price: retailPrice,
      quantity: 1,
      cost_subtotal: 0,
      retail_subtotal: 0,
      profit: 0,
      margin_pct: 0,
    });

    setItems(prev => [...prev, newItem]);
    setShowProductPicker(false);
    setSearch("");
  }, []);

  const updateItem = useCallback((idx: number, field: string, value: number) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = computeItem({ ...updated[idx], [field]: value });
      return updated;
    });
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const applyUmbrellaMargin = useCallback((marginPct: number) => {
    setUmbrellaMargin(marginPct);
    setItems(prev =>
      prev.map(item => {
        const newRetail = Math.round((item.unit_cost / (1 - marginPct / 100)) * 100) / 100;
        if (!isFinite(newRetail) || newRetail < 0) return item;
        return computeItem({ ...item, retail_price: newRetail });
      })
    );
  }, []);

  const roundAllPrices = useCallback((direction: "up" | "down") => {
    const fn = direction === "up" ? Math.ceil : Math.floor;
    setItems(prev => prev.map(item => {
      const rounded = fn(item.retail_price);
      return computeItem({ ...item, retail_price: rounded > 0 ? rounded : 1 });
    }));
  }, []);

  const totals = useMemo(() => {
    const totalCost = items.reduce((s, i) => s + i.cost_subtotal, 0);
    const totalRetail = items.reduce((s, i) => s + i.retail_subtotal, 0);
    const totalProfit = totalRetail - totalCost;
    const overallMargin = totalRetail > 0 ? (totalProfit / totalRetail) * 100 : 0;
    return { totalCost, totalRetail, totalProfit, overallMargin };
  }, [items]);

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase();
    const selectedIds = new Set(items.map(i => i.product_id));
    return products.filter(p =>
      !selectedIds.has(p.id) &&
      (p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) ||
       (p.coffee_categories?.name || "").toLowerCase().includes(term))
    );
  }, [products, search, items]);

  async function saveProposal() {
    if (items.length === 0) { showToast("Add at least one product", "error"); return; }
    setSaving(true);
    try {
      const body = {
        client_name: clientName || null,
        client_company: clientCompany || null,
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
        company_name: companyName || null,
        company_email: companyEmail || null,
        company_phone: companyPhone || null,
        company_website: companyWebsite || null,
        company_address: companyAddress || null,
        company_city: companyCity || null,
        company_state: companyState || null,
        company_zip: companyZip || null,
        notes: notes || null,
        valid_until: validUntil || null,
        items,
      };

      const url = proposalId
        ? `/api/coffee/pricing-proposals/${proposalId}`
        : "/api/coffee/pricing-proposals";

      const res = await fetch(url, {
        method: proposalId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        if (!proposalId) {
          setProposalId(data.id);
          setProposalNumber(data.proposal_number);
          setShareToken(data.share_token);
        } else {
          if (data.share_token) setShareToken(data.share_token);
        }
        showToast(proposalId ? "Proposal updated" : "Proposal saved", "success");

        const proposalsRes = await fetch("/api/coffee/pricing-proposals", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (proposalsRes.ok) {
          const pData = await proposalsRes.json();
          setSavedProposals(Array.isArray(pData) ? pData : []);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to save", "error");
      }
    } catch {
      showToast("Failed to save proposal", "error");
    }
    setSaving(false);
  }

  async function sendProposal() {
    if (!proposalId) {
      showToast("Save the proposal first", "error");
      return;
    }
    if (!clientEmail) {
      showToast("Client email is required to send", "error");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/coffee/pricing-proposals/${proposalId}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showToast("Proposal sent to client", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to send", "error");
      }
    } catch {
      showToast("Failed to send proposal", "error");
    }
    setSending(false);
  }

  async function loadProposal(id: string) {
    try {
      const res = await fetch(`/api/coffee/pricing-proposals/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProposalId(data.id);
        setProposalNumber(data.proposal_number);
        setShareToken(data.share_token || "");
        setClientName(data.client_name || "");
        setClientCompany(data.client_company || "");
        setClientEmail(data.client_email || "");
        setClientPhone(data.client_phone || "");
        setCompanyName(data.company_name || "");
        setCompanyEmail(data.company_email || "");
        setCompanyPhone(data.company_phone || "");
        setCompanyWebsite(data.company_website || "");
        setCompanyAddress(data.company_address || "");
        setCompanyCity(data.company_city || "");
        setCompanyState(data.company_state || "");
        setCompanyZip(data.company_zip || "");
        setNotes(data.notes || "");
        setValidUntil(data.valid_until ? data.valid_until.split("T")[0] : "");
        const loadedItems = (data.coffee_pricing_proposal_items || []).map((item: ProposalItem) => computeItem(item));
        setItems(loadedItems);
        setShowProposals(false);
        showToast(`Loaded ${data.proposal_number}`, "success");
      }
    } catch {
      showToast("Failed to load proposal", "error");
    }
  }

  function newProposal() {
    setProposalId(null);
    setProposalNumber("");
    setShareToken("");
    setClientName("");
    setClientCompany("");
    setClientEmail("");
    setClientPhone("");
    setNotes("");
    setValidUntil("");
    setItems([]);
    setShowProposals(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/coffee" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to Marketplace
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coffee Pricing Calculator</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {proposalNumber ? `Editing ${proposalNumber}` : "Build and send client proposals"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowProposals(!showProposals)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">
            <FileText className="h-4 w-4" /> My Proposals
          </button>
          <button onClick={newProposal} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer">
            <Plus className="h-4 w-4" /> New
          </button>
        </div>
      </div>

      {/* Saved proposals dropdown */}
      {showProposals && savedProposals.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Saved Proposals</span>
            <button onClick={() => setShowProposals(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
          <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
            {savedProposals.map(p => (
              <button
                key={p.id}
                onClick={() => loadProposal(p.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left cursor-pointer"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">{p.proposal_number}</span>
                  {p.client_company && <span className="ml-2 text-sm text-gray-500">{p.client_company}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">${Number(p.total_retail || 0).toFixed(2)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.status === "sent" ? "bg-blue-50 text-blue-700" :
                    p.status === "viewed" ? "bg-purple-50 text-purple-700" :
                    p.status === "accepted" ? "bg-green-50 text-green-700" :
                    "bg-gray-50 text-gray-600"
                  }`}>{p.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Calculator */}
        <div className="lg:col-span-2 space-y-6">

          {/* Branding Section */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => setShowBranding(!showBranding)}
              className="w-full flex items-center justify-between p-4 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-gray-900">Your Company Branding</span>
                {companyName && <span className="text-sm text-gray-500">— {companyName}</span>}
              </div>
              {showBranding ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {showBranding && (
              <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
                  <input value={companyWebsite} onChange={e => setCompanyWebsite(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                  <input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" placeholder="Street address" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input value={companyCity} onChange={e => setCompanyCity(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                    <input value={companyState} onChange={e => setCompanyState(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
                    <input value={companyZip} onChange={e => setCompanyZip(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Client Info */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" /> Client Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Client Name</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="John Doe" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Company</label>
                <input value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="Client Corp" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(555) 123-4567" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Product Selection */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="h-4 w-4 text-green-600" /> Products & Pricing
              </h3>
              <button
                onClick={() => setShowProductPicker(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Product
              </button>
            </div>

            {items.length > 0 && (
              <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Set All Margins</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="80"
                  step="1"
                  value={umbrellaMargin}
                  onChange={e => applyUmbrellaMargin(parseInt(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none bg-gray-200 accent-green-600"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={umbrellaMargin}
                    onChange={e => applyUmbrellaMargin(parseInt(e.target.value) || 40)}
                    className="w-14 rounded border border-gray-200 px-2 py-1 text-sm font-bold text-green-700 text-center focus:border-green-500 focus:outline-none"
                  />
                  <span className="text-sm font-medium text-gray-500">%</span>
                </div>
                <button
                  onClick={() => applyUmbrellaMargin(umbrellaMargin)}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 cursor-pointer whitespace-nowrap"
                >
                  Apply
                </button>
                <div className="border-l border-gray-200 pl-3 flex items-center gap-1">
                  <button
                    onClick={() => roundAllPrices("down")}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 cursor-pointer whitespace-nowrap"
                    title="Round all prices down to nearest dollar"
                  >
                    Round Down
                  </button>
                  <button
                    onClick={() => roundAllPrices("up")}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 cursor-pointer whitespace-nowrap"
                    title="Round all prices up to nearest dollar"
                  >
                    Round Up
                  </button>
                </div>
              </div>
            )}

            {items.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="mx-auto h-10 w-10 text-gray-300 mb-3" />
                <p className="text-sm text-gray-500">No products added yet</p>
                <button onClick={() => setShowProductPicker(true)} className="mt-3 text-sm font-medium text-green-600 hover:text-green-700 cursor-pointer">
                  Add your first product
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {items.map((item, idx) => (
                  <div key={idx} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm truncate">
                            {item.product_name}
                            {item.pack_quantity > 1 && (
                              <span className="ml-1.5 text-xs font-normal text-gray-400">({item.pack_quantity} pk)</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-400">{item.sku}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{item.category}</span>
                        </div>
                      </div>
                      <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 cursor-pointer p-1">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 mb-0.5 uppercase">Your Cost</label>
                        <div className="text-sm font-medium text-gray-700">${item.unit_cost.toFixed(2)}</div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 mb-0.5 uppercase">Retail Price</label>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.retail_price}
                            onChange={e => updateItem(idx, "retail_price", parseFloat(e.target.value) || 0)}
                            className="w-20 rounded border border-gray-200 px-2 py-1 text-sm font-medium focus:border-green-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 mb-0.5 uppercase">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="w-16 rounded border border-gray-200 px-2 py-1 text-sm font-medium focus:border-green-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-400 mb-0.5 uppercase">Margin</label>
                        <span className={`text-sm font-bold ${item.margin_pct >= 30 ? "text-green-600" : item.margin_pct >= 15 ? "text-yellow-600" : "text-red-600"}`}>
                          {item.margin_pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Margin slider */}
                    <div className="mt-2">
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="1"
                        value={Math.round(item.margin_pct)}
                        onChange={e => {
                          const marginPct = parseInt(e.target.value);
                          const newRetail = Math.round(item.unit_cost / (1 - marginPct / 100) * 100) / 100;
                          if (isFinite(newRetail) && newRetail >= 0) {
                            updateItem(idx, "retail_price", newRetail);
                          }
                        }}
                        className="w-full h-1.5 rounded-full appearance-none bg-gray-200 accent-green-600"
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>Profit: <span className="font-medium text-green-600">${item.profit.toFixed(2)}</span></span>
                      <span>Retail subtotal: <span className="font-medium text-gray-700">${item.retail_subtotal.toFixed(2)}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes / Terms</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any notes or terms for this proposal..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none resize-none"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="block text-xs font-medium text-gray-500 mb-1">Valid Until</label>
            <input
              type="date"
              value={validUntil}
              onChange={e => setValidUntil(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Right: Summary Sidebar */}
        <div className="space-y-4">
          {/* Profit Summary — operator only */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm sticky top-6">
            <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Profit Summary
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Your Total Cost</span>
                <span className="font-medium text-gray-900">${totals.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Client Total (Retail)</span>
                <span className="font-medium text-gray-900">${totals.totalRetail.toFixed(2)}</span>
              </div>
              <div className="border-t border-green-200 pt-2 flex justify-between text-sm">
                <span className="font-semibold text-green-800">Your Profit</span>
                <span className="font-bold text-green-700 text-lg">${totals.totalProfit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Overall Margin</span>
                <span className={`font-bold ${totals.overallMargin >= 30 ? "text-green-700" : totals.overallMargin >= 15 ? "text-yellow-600" : "text-red-600"}`}>
                  {totals.overallMargin.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={saveProposal}
                disabled={saving || items.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {proposalId ? "Update Proposal" : "Save Proposal"}
              </button>

              {proposalId && (
                <>
                  <button
                    onClick={sendProposal}
                    disabled={sending || !clientEmail}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send to Client
                  </button>

                  <a
                    href={`/api/coffee/pricing-proposals/${proposalId}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" /> Download PDF
                  </a>

                  {shareToken && (
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/coffee/proposals/${shareToken}`;
                        navigator.clipboard.writeText(url);
                        showToast("Proposal link copied!", "success");
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <Copy className="h-4 w-4" /> Copy Share Link
                    </button>
                  )}

                  {shareToken && (
                    <Link
                      href={`/coffee/proposals/${shareToken}`}
                      target="_blank"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Eye className="h-4 w-4" /> Preview Client View
                    </Link>
                  )}
                </>
              )}
            </div>

            {!clientEmail && proposalId && (
              <div className="mt-3 flex items-start gap-1.5 text-xs text-amber-600">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Add client email to enable sending</span>
              </div>
            )}
          </div>

          {/* Items quick summary */}
          {items.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Items ({items.length})</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-gray-700 truncate mr-2">{item.quantity}x {item.product_name}</span>
                    <span className="text-gray-500 shrink-0">${item.retail_subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Add Product</h3>
              <button onClick={() => { setShowProductPicker(false); setSearch(""); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  {search ? "No matching products" : "All products have been added"}
                </div>
              ) : (
                filteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => addProduct(product)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left cursor-pointer"
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {product.name}
                        {product.pack_quantity > 1 && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400">({product.pack_quantity} pk)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {product.coffee_categories?.name || "Other"} · {product.sku} · ${product.price.toFixed(2)}/{product.unit}
                      </p>
                    </div>
                    <Plus className="h-4 w-4 text-green-600 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg flex items-center gap-2 ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
