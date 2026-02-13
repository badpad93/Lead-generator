"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";

interface Run {
  id: string;
  city: string;
  state: string;
  radius_miles: number;
  max_leads: number;
  industries: string[];
  status: "queued" | "running" | "done" | "failed";
  progress: { total: number; message: string };
  created_at: string;
}

interface Lead {
  id: string;
  industry: string;
  business_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  website: string;
  employee_count: number | null;
  customer_count: number | null;
  decision_maker: string | null;
  contacted_date: string | null;
  notes: string | null;
  source_url: string;
  distance_miles: number | null;
  confidence: number | null;
}

const PAGE_SIZE = 50;

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;

  const [run, setRun] = useState<Run | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editDate, setEditDate] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRun = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}`);
    if (res.ok) {
      const data = await res.json();
      setRun(data);
      return data.status;
    }
    return null;
  }, [runId]);

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (search) params.set("search", search);

    const res = await fetch(`/api/runs/${runId}/leads?${params}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
    }
  }, [runId, page, search]);

  // Initial load
  useEffect(() => {
    (async () => {
      await fetchRun();
      await fetchLeads();
      setLoading(false);
    })();
  }, [fetchRun, fetchLeads]);

  // Poll while running
  useEffect(() => {
    if (run?.status === "running" || run?.status === "queued") {
      pollRef.current = setInterval(async () => {
        const status = await fetchRun();
        await fetchLeads();
        if (status === "done" || status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 4000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run?.status, fetchRun, fetchLeads]);

  async function handleStart() {
    setStarting(true);
    const res = await fetch(`/api/runs/${runId}/start`, { method: "POST" });
    if (res.ok) {
      await fetchRun();
    }
    setStarting(false);
  }

  async function handleSaveEdit(leadId: string) {
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: editNotes || null,
        contacted_date: editDate || null,
      }),
    });
    setEditingId(null);
    await fetchLeads();
  }

  function startEdit(lead: Lead) {
    setEditingId(lead.id);
    setEditNotes(lead.notes ?? "");
    setEditDate(lead.contacted_date ?? "");
  }

  const statusColor: Record<string, string> = {
    queued: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    done: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!run) {
    return <div className="text-center py-20 text-gray-500">Run not found</div>;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Run Header */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {run.city}, {run.state}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {run.radius_miles} mile radius &middot; Max {run.max_leads} leads
              &middot; {run.industries.length} industries
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Run ID: {run.id}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor[run.status]}`}
          >
            {run.status.toUpperCase()}
          </span>
        </div>

        {/* Progress */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">
                {run.progress.total} leads collected
              </span>
              <span className="text-gray-500">
                {run.status === "running" ? "Processing..." : ""}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (run.progress.total / run.max_leads) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {run.progress.message}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-3 flex-wrap">
          {run.status === "queued" && (
            <button
              onClick={handleStart}
              disabled={starting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              {starting ? "Starting..." : "Start Run"}
            </button>
          )}
          {(run.status === "done" || run.progress.total > 0) && (
            <>
              <a
                href={`/api/runs/${run.id}/export.csv`}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm border"
              >
                Export CSV
              </a>
              <a
                href={`/api/runs/${run.id}/export.xlsx`}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm border"
              >
                Export Excel
              </a>
            </>
          )}
        </div>
      </div>

      {/* Industries */}
      <div className="flex flex-wrap gap-2">
        {run.industries.map((ind) => (
          <span
            key={ind}
            className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium"
          >
            {ind}
          </span>
        ))}
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <h2 className="font-semibold">
            Leads ({total})
          </h2>
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="max-w-xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Industry</th>
                <th>Address</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Distance</th>
                <th>Confidence</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-gray-400 py-8">
                    {run.status === "running"
                      ? "Leads will appear here as they are collected..."
                      : "No leads found"}
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="font-medium max-w-[200px] truncate">
                      {lead.business_name}
                    </td>
                    <td>
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                        {lead.industry}
                      </span>
                    </td>
                    <td className="text-xs max-w-[180px] truncate">
                      {[lead.address, lead.city, lead.state, lead.zip]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td className="text-xs whitespace-nowrap">{lead.phone}</td>
                    <td className="text-xs max-w-[150px] truncate">
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {lead.website.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs">
                      {lead.distance_miles != null
                        ? `${lead.distance_miles} mi`
                        : "—"}
                    </td>
                    <td className="text-xs">
                      {lead.confidence != null ? (
                        <span
                          className={`font-semibold ${
                            lead.confidence >= 0.6
                              ? "text-green-600"
                              : lead.confidence >= 0.3
                                ? "text-yellow-600"
                                : "text-red-600"
                          }`}
                        >
                          {(lead.confidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs max-w-[150px]">
                      {editingId === lead.id ? (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Notes..."
                            className="text-xs"
                          />
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="text-xs"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSaveEdit(lead.id)}
                              className="text-xs text-green-600 hover:underline"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-gray-400 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="truncate block">
                          {lead.notes || "—"}
                          {lead.contacted_date && (
                            <span className="block text-gray-400">
                              Contacted: {lead.contacted_date}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td>
                      {editingId !== lead.id && (
                        <button
                          onClick={() => startEdit(lead)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 border rounded text-sm disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
