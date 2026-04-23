"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Plus, Loader2, Search, X, UserPlus, ArrowRight, Trash2, PhoneOff, Phone, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { ENTITY_TYPES, IMMEDIATE_NEEDS, type SalesLead, type EntityType, type ImmediateNeed } from "@/lib/salesTypes";

const LEAD_FIELDS: { key: LeadFieldKey; label: string; required?: boolean }[] = [
  { key: "business_name", label: "Business Name", required: true },
  { key: "contact_name", label: "Contact Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "source", label: "Source" },
  { key: "notes", label: "Notes" },
  { key: "entity_type", label: "Entity Type" },
  { key: "immediate_need", label: "Immediate Need" },
];

type LeadFieldKey = "business_name" | "contact_name" | "phone" | "email" | "address" | "city" | "state" | "source" | "notes" | "entity_type" | "immediate_need";

const HEADER_ALIASES: Record<string, LeadFieldKey> = {
  "business name": "business_name",
  "business": "business_name",
  "company": "business_name",
  "company name": "business_name",
  "name": "business_name",
  "contact name": "contact_name",
  "contact": "contact_name",
  "contact person": "contact_name",
  "first name": "contact_name",
  "phone": "phone",
  "phone number": "phone",
  "telephone": "phone",
  "cell": "phone",
  "mobile": "phone",
  "email": "email",
  "email address": "email",
  "e-mail": "email",
  "address": "address",
  "street": "address",
  "street address": "address",
  "city": "city",
  "town": "city",
  "state": "state",
  "st": "state",
  "province": "state",
  "source": "source",
  "lead source": "source",
  "notes": "notes",
  "note": "notes",
  "comments": "notes",
  "entity type": "entity_type",
  "type": "entity_type",
  "immediate need": "immediate_need",
  "need": "immediate_need",
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current.trim());
        current = "";
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        row.push(current.trim());
        current = "";
        if (row.some((c) => c)) rows.push(row);
        row = [];
        if (ch === "\r") i++;
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

function autoMapColumns(headers: string[]): Record<number, LeadFieldKey | ""> {
  const mapping: Record<number, LeadFieldKey | ""> = {};
  const used = new Set<LeadFieldKey>();

  headers.forEach((h, i) => {
    const normalized = h.toLowerCase().replace(/[_\-]/g, " ").trim();
    const match = HEADER_ALIASES[normalized];
    if (match && !used.has(match)) {
      mapping[i] = match;
      used.add(match);
    } else {
      mapping[i] = "";
    }
  });

  return mapping;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState<"admin" | "sales">("sales");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [salesUsers, setSalesUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [hideDnc, setHideDnc] = useState(false);
  const [addForm, setAddForm] = useState({ business_name: "", contact_name: "", phone: "", email: "", address: "", city: "", state: "", source: "", notes: "", do_not_call: false, entity_type: "location" as EntityType, immediate_need: "" as ImmediateNeed | "" });

  // CSV Import state
  const [showImport, setShowImport] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, LeadFieldKey | "">>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setToken(session.access_token);
      setUserId(session.user.id);

      const usersRes = await fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (usersRes.ok) {
        const users = await usersRes.json();
        setSalesUsers(users);
        const me = users.find((u: { id: string }) => u.id === session.user.id);
        if (me?.role === "admin") setUserRole("admin");
      }
    }
    init();
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/leads", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setLeads(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function handleAdd() {
    if (!addForm.business_name) return;
    const res = await fetch("/api/sales/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(addForm),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add lead");
      return;
    }
    setAddForm({ business_name: "", contact_name: "", phone: "", email: "", address: "", city: "", state: "", source: "", notes: "", do_not_call: false, entity_type: "location", immediate_need: "" });
    setShowAdd(false);
    fetchLeads();
  }

  async function handleClaim(id: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "claim" }),
    });
    fetchLeads();
  }

  async function handleAssign(id: string, assignTo: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assigned_to: assignTo }),
    });
    fetchLeads();
  }

  async function handleConvert(id: string) {
    const res = await fetch(`/api/sales/leads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "convert" }),
    });
    if (res.ok) {
      fetchLeads();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    const res = await fetch(`/api/sales/leads/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete");
      return;
    }
    fetchLeads();
  }

  async function handleImmediateNeed(id: string, immediate_need: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ immediate_need: immediate_need || null }),
    });
    fetchLeads();
  }

  async function handleEntityType(id: string, entity_type: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ entity_type: entity_type || null }),
    });
    fetchLeads();
  }

  async function handleToggleDnc(id: string, current: boolean) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ do_not_call: !current }),
    });
    fetchLeads();
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        alert("File must have a header row and at least one data row.");
        return;
      }
      const headers = parsed[0];
      const data = parsed.slice(1);
      setCsvHeaders(headers);
      setCsvRows(data);
      setColumnMapping(autoMapColumns(headers));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleImport() {
    const businessNameCol = Object.entries(columnMapping).find(([, v]) => v === "business_name");
    if (!businessNameCol) {
      alert("You must map at least the Business Name column.");
      return;
    }

    setImporting(true);
    const leads = csvRows.map((row) => {
      const lead: Record<string, string | boolean> = {};
      Object.entries(columnMapping).forEach(([colIdx, field]) => {
        if (field && row[Number(colIdx)]) {
          lead[field] = row[Number(colIdx)];
        }
      });
      return lead;
    }).filter((l) => l.business_name);

    const res = await fetch("/api/sales/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leads }),
    });

    if (res.ok) {
      const result = await res.json();
      setImportResult(result);
      if (result.imported > 0) fetchLeads();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Import failed");
    }
    setImporting(false);
  }

  function resetImport() {
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMapping({});
    setImportResult(null);
    setShowImport(false);
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/sales/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    fetchLeads();
  }

  const availableStates = Array.from(
    new Set(leads.map((l) => (l.state || "").trim().toUpperCase()).filter(Boolean))
  ).sort();

  const filtered = leads.filter((l) => {
    if (hideDnc && l.do_not_call) return false;
    if (stateFilter && (l.state || "").toUpperCase() !== stateFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.business_name.toLowerCase().includes(q) ||
      (l.contact_name || "").toLowerCase().includes(q) ||
      (l.state || "").toLowerCase().includes(q) ||
      (l.city || "").toLowerCase().includes(q)
    );
  });

  const statusColor: Record<string, string> = {
    new: "bg-blue-50 text-blue-700 ring-blue-200",
    contacted: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    qualified: "bg-green-50 text-green-700 ring-green-200",
    unqualified: "bg-gray-100 text-gray-600 ring-gray-200",
    lost: "bg-red-50 text-red-700 ring-red-200",
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImport(!showImport); setShowAdd(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setShowImport(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">New Lead</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input placeholder="Business Name *" value={addForm.business_name} onChange={(e) => setAddForm((f) => ({ ...f, business_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Contact Name" value={addForm.contact_name} onChange={(e) => setAddForm((f) => ({ ...f, contact_name: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="Address" value={addForm.address} onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="City" value={addForm.city} onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <input placeholder="State (e.g. TX)" maxLength={2} value={addForm.state} onChange={(e) => setAddForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none uppercase" />
            <input placeholder="Source (referral, web, cold call...)" value={addForm.source} onChange={(e) => setAddForm((f) => ({ ...f, source: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" />
            <select value={addForm.entity_type} onChange={(e) => setAddForm((f) => ({ ...f, entity_type: e.target.value as EntityType }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select value={addForm.immediate_need} onChange={(e) => setAddForm((f) => ({ ...f, immediate_need: e.target.value as ImmediateNeed | "" }))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer">
              <option value="">Immediate Need —</option>
              {IMMEDIATE_NEEDS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <textarea placeholder="Notes" value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none" rows={2} />
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={addForm.do_not_call}
              onChange={(e) => setAddForm((f) => ({ ...f, do_not_call: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <PhoneOff className="h-4 w-4 text-red-600" />
            Do Not Call
          </label>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">Save</button>
            <button onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* CSV Import */}
      {showImport && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              <h3 className="text-sm font-semibold text-gray-900">Import Leads from CSV</h3>
            </div>
            <button onClick={resetImport} className="text-gray-400 hover:text-gray-600 cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>

          {csvHeaders.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center w-full">
                <Upload className="mx-auto h-8 w-8 text-gray-300 mb-3" />
                <p className="text-sm text-gray-600 mb-1">Drop your CSV file here or click to browse</p>
                <p className="text-xs text-gray-400">Supports .csv files with a header row</p>
                <label className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">
                  <Upload className="h-4 w-4" />
                  Choose File
                  <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>
          ) : importResult ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Import complete: {importResult.imported} lead{importResult.imported !== 1 ? "s" : ""} imported
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-xs text-green-700 mt-1">{importResult.skipped} row{importResult.skipped !== 1 ? "s" : ""} skipped</p>
                  )}
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <p className="text-xs font-medium text-amber-800">Issues</p>
                  </div>
                  <ul className="space-y-1 text-xs text-amber-700 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {importResult.errors.length > 20 && (
                      <li>...and {importResult.errors.length - 20} more</li>
                    )}
                  </ul>
                </div>
              )}
              <button onClick={resetImport} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 cursor-pointer">
                Done
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Column mapping */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Map your spreadsheet columns to lead fields. We auto-detected what we could.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {csvHeaders.map((header, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                      <p className="text-xs font-medium text-gray-900 truncate mb-1" title={header}>{header}</p>
                      <select
                        value={columnMapping[i] || ""}
                        onChange={(e) => setColumnMapping((m) => ({ ...m, [i]: e.target.value as LeadFieldKey | "" }))}
                        className={`w-full rounded border px-2 py-1 text-xs cursor-pointer ${
                          columnMapping[i] ? "border-green-300 bg-green-50 text-green-800" : "border-gray-200 text-gray-500"
                        }`}
                      >
                        <option value="">— Skip —</option>
                        {LEAD_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}{f.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">
                  Preview ({csvRows.length} row{csvRows.length !== 1 ? "s" : ""} — showing first {Math.min(5, csvRows.length)})
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-400">#</th>
                        {csvHeaders.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
                            <div>{h}</div>
                            {columnMapping[i] && (
                              <div className="text-[10px] font-normal text-green-600 mt-0.5">
                                → {LEAD_FIELDS.find((f) => f.key === columnMapping[i])?.label}
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {csvRows.slice(0, 5).map((row, ri) => (
                        <tr key={ri} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-400">{ri + 1}</td>
                          {csvHeaders.map((_, ci) => (
                            <td key={ci} className={`px-3 py-2 max-w-[200px] truncate ${columnMapping[ci] ? "text-gray-900" : "text-gray-300"}`}>
                              {row[ci] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {!Object.values(columnMapping).includes("business_name") && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700">Map at least the <strong>Business Name</strong> column to import leads.</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleImport}
                  disabled={importing || !Object.values(columnMapping).includes("business_name")}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                >
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="h-4 w-4" /> Import {csvRows.length} Lead{csvRows.length !== 1 ? "s" : ""}</>}
                </button>
                <button
                  onClick={() => { setCsvHeaders([]); setCsvRows([]); setColumnMapping({}); }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  Choose Different File
                </button>
                <button onClick={resetImport} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search + state filter */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business, contact, city, or state..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-9 text-sm placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="shrink-0 w-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
        >
          <option value="">All States</option>
          {availableStates.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideDnc}
            onChange={(e) => setHideDnc(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          Hide Do Not Call
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">No leads found</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Business</th>
                <th className="px-4 py-3 font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500">Immediate Need</th>
                <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
                <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500">State</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Assigned</th>
                <th className="px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{lead.business_name}</td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.entity_type || ""}
                      onChange={(e) => handleEntityType(lead.id, e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                    >
                      <option value="">—</option>
                      {ENTITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.immediate_need || ""}
                      onChange={(e) => handleImmediateNeed(lead.id, e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                    >
                      <option value="">—</option>
                      {IMMEDIATE_NEEDS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {lead.do_not_call ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200" title="Do Not Call">
                        <PhoneOff className="h-3 w-3" />
                        DNC
                      </span>
                    ) : (
                      lead.phone || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {lead.state ? (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {lead.state}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset cursor-pointer ${statusColor[lead.status] || ""}`}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="unqualified">Unqualified</option>
                      <option value="lost">Lost</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {userRole === "admin" ? (
                      <select
                        value={lead.assigned_to || ""}
                        onChange={(e) => handleAssign(lead.id, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {salesUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                      </select>
                    ) : (
                      lead.assigned_profile?.full_name || "Unassigned"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {!lead.assigned_to && (
                        <button
                          onClick={() => handleClaim(lead.id)}
                          title="Claim"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 cursor-pointer"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleDnc(lead.id, !!lead.do_not_call)}
                        title={lead.do_not_call ? "Remove Do Not Call" : "Mark Do Not Call"}
                        className={`rounded-lg p-1.5 cursor-pointer ${lead.do_not_call ? "bg-red-50 text-red-600 hover:bg-red-100" : "text-gray-400 hover:bg-red-50 hover:text-red-600"}`}
                      >
                        {lead.do_not_call ? <Phone className="h-4 w-4" /> : <PhoneOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleConvert(lead.id)}
                        title="Convert to Deal"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600 cursor-pointer"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(lead.id)}
                        title="Delete"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
